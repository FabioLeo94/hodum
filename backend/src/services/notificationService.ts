import { pool } from '../db/pool';
import type { Notification, NotificationType } from '../models/notification';
import { isValidUuid } from '../utils/uuid';
import { formatDateOnly } from '../utils/dateOnly';
import { emitNotificationCreated } from '../realtime/io';

// Stesso pattern di CommentNotFoundError in taskCommentService.ts: segnala
// "0 righe modificate" al chiamante senza che il service conosca HTTP, il
// controller intercetta e decide lo status (404).
export class NotificationNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Notifica con id ${id} non trovata`);
    this.name = 'NotificationNotFoundError';
  }
}

// Forma della riga così come esce dalla JOIN con projects/tasks/users: stesso
// principio di TaskCommentRow in taskCommentService.ts, i campi denormalizzati
// (project_name, task_title, actor_username) vengono da tabelle diverse da
// notifications e possono essere NULL: project_id/task_id/actor_id sono
// nullable in schema, e le rispettive JOIN sono LEFT JOIN di conseguenza.
interface NotificationRow {
  id: string;
  type: NotificationType;
  read: boolean;
  created_at: string;
  project_id: string | null;
  project_name: string | null;
  task_id: string | null;
  task_title: string | null;
  comment_id: string | null;
  actor_id: string | null;
  actor_username: string | null;
  // Come tasks.due_date in taskService.ts: colonna `date`, il driver pg la
  // converte sempre in Date a runtime.
  due_date: Date | null;
}

// Select condivisa da listForUser e dalla ri-selezione dopo l'insert in
// notifyUsers: stesso pattern di TASK_COMMENT_SELECT in
// taskCommentService.ts, cambia solo il filtro WHERE. Il frontend compone il
// testo del messaggio da questi campi denormalizzati, il backend non spedisce
// stringhe pre-formattate (vedi commento in models/notification.ts).
const NOTIFICATION_SELECT = `SELECT n.id, n.type, n.read, n.created_at,
       n.project_id, p.name AS project_name,
       n.task_id, t.title AS task_title,
       n.comment_id, n.actor_id, actor.username AS actor_username,
       n.due_date
     FROM notifications n
     LEFT JOIN projects p ON p.id = n.project_id
     LEFT JOIN tasks t ON t.id = n.task_id
     LEFT JOIN users actor ON actor.id = n.actor_id`;

function toNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    type: row.type,
    read: row.read,
    createdAt: row.created_at,
    projectId: row.project_id,
    projectName: row.project_name,
    taskId: row.task_id,
    taskTitle: row.task_title,
    commentId: row.comment_id,
    actorId: row.actor_id,
    actorUsername: row.actor_username,
    dueDate: row.due_date ? formatDateOnly(row.due_date) : null,
  };
}

// Ultime 50 per created_at DESC, più il conteggio dei non letti calcolato a
// parte: il conteggio non deve dipendere dal limite di 50, altrimenti un
// utente con più di 50 notifiche non lette vedrebbe un badge fermo a un
// numero sbagliato.
export async function listForUser(userId: string): Promise<{ items: Notification[]; unreadCount: number }> {
  const [itemsResult, countResult] = await Promise.all([
    pool.query<NotificationRow>(`${NOTIFICATION_SELECT} WHERE n.user_id = $1 ORDER BY n.created_at DESC LIMIT 50`, [userId]),
    pool.query<{ count: number }>('SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND read = false', [
      userId,
    ]),
  ]);
  return {
    items: itemsResult.rows.map(toNotification),
    unreadCount: countResult.rows[0].count,
  };
}

export async function markAsRead(id: string, userId: string): Promise<void> {
  if (!isValidUuid(id)) {
    throw new NotificationNotFoundError(id);
  }
  // Il filtro su user_id (oltre a id) è ciò che impedisce a un utente di
  // marcare come lette le notifiche di un altro conoscendone l'id: senza,
  // "0 righe" e "riga di un altro utente" sarebbero indistinguibili solo
  // filtrando su id.
  const result = await pool.query('UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2', [id, userId]);
  if (result.rowCount === 0) {
    throw new NotificationNotFoundError(id);
  }
}

export async function markAllAsRead(userId: string): Promise<void> {
  await pool.query('UPDATE notifications SET read = true WHERE user_id = $1 AND read = false', [userId]);
}

export interface NotifyUsersParams {
  companyId: string;
  type: NotificationType;
  projectId?: string;
  taskId?: string;
  commentId?: string;
  actorId?: string;
  dueDate?: string;
}

// Primitivo di basso livello: inserisce una notifica per ciascun destinatario
// e la trasmette via realtime. ON CONFLICT DO NOTHING senza conflict target
// esplicito basta perché l'unico vincolo che può davvero collidere qui è
// l'indice parziale su (user_id, task_id, due_date) WHERE type = 'task_due'
// (dedup del promemoria scadenza): id è sempre gen_random_uuid(), non
// collide mai sulla PRIMARY KEY.
export async function notifyUsers(userIds: string[], params: NotifyUsersParams): Promise<void> {
  if (userIds.length === 0) return;

  // Un solo round-trip invece di uno per destinatario (N+1): stesso principio
  // del bulk insert via unnest in projectAssignmentService.ts. RETURNING
  // include user_id (non solo id) per sapere a chi instradare ciascun evento
  // realtime senza una query aggiuntiva per riga.
  const inserted = await pool.query<{ id: string; user_id: string }>(
    `INSERT INTO notifications (user_id, company_id, type, project_id, task_id, comment_id, actor_id, due_date)
     SELECT uid, $2, $3, $4, $5, $6, $7, $8
     FROM unnest($1::uuid[]) AS uid
     ON CONFLICT DO NOTHING
     RETURNING id, user_id`,
    [
      userIds,
      params.companyId,
      params.type,
      params.projectId ?? null,
      params.taskId ?? null,
      params.commentId ?? null,
      params.actorId ?? null,
      params.dueDate ?? null,
    ],
  );

  if (inserted.rows.length === 0) return;

  // Ri-seleziona con la JOIN invece di comporre a mano il risultato: stesso
  // motivo di createComment in taskCommentService.ts (project_name/
  // task_title/actor_username non disponibili sull'INSERT, che tocca solo
  // notifications). Un solo round-trip con WHERE ... = ANY($1) invece di uno
  // per destinatario (stesso principio del bulk insert via unnest sopra):
  // con N destinatari la versione precedente eseguiva N query sequenziali
  // solo per ri-leggere ciò che era appena stato scritto in blocco.
  const insertedIds = inserted.rows.map((row) => row.id);
  const result = await pool.query<NotificationRow>(`${NOTIFICATION_SELECT} WHERE n.id = ANY($1::uuid[])`, [insertedIds]);
  const rowById = new Map(result.rows.map((row) => [row.id, row]));

  for (const row of inserted.rows) {
    const notificationRow = rowById.get(row.id);
    // Non dovrebbe mai mancare (nessun percorso elimina notifications tra
    // l'INSERT sopra e questa SELECT): guardia difensiva contro un
    // emitNotificationCreated su un valore undefined, invece di un throw.
    if (!notificationRow) continue;
    emitNotificationCreated(toNotification(notificationRow), row.user_id);
  }
}

export interface NotifyProjectTeamParams {
  type: NotificationType;
  actorId?: string;
  taskId?: string;
  commentId?: string;
  dueDate?: string;
}

// Wrapper su notifyUsers: risolve i destinatari di un progetto (il team
// assegnato + l'owner della company, che vede sempre tutti i progetti anche
// senza un'assegnazione esplicita) ed esclude l'autore dell'evento, se noto.
export async function notifyProjectTeam(projectId: string, params: NotifyProjectTeamParams): Promise<void> {
  const projectResult = await pool.query<{ company_id: string; owner_id: string }>(
    `SELECT p.company_id, c.owner_id FROM projects p JOIN companies c ON c.id = p.company_id WHERE p.id = $1`,
    [projectId],
  );
  const project = projectResult.rows[0];
  if (!project) {
    // Il chiamante (createTask/createComment/setProjectAssignments) ha già
    // verificato l'esistenza del progetto a monte: arrivare qui senza riga
    // significherebbe una race (progetto eliminato nel frattempo). No-op
    // invece di lanciare: coerente con "un bug nelle notifiche non deve mai
    // far fallire l'operazione chiamante" applicato dai punti di innesto.
    return;
  }

  const recipientsResult = await pool.query<{ user_id: string }>(
    `SELECT user_id FROM project_assignments WHERE project_id = $1
     UNION
     SELECT $2::uuid`,
    [projectId, project.owner_id],
  );
  const recipients = recipientsResult.rows.map((row) => row.user_id).filter((userId) => userId !== params.actorId);

  await notifyUsers(recipients, {
    companyId: project.company_id,
    type: params.type,
    projectId,
    taskId: params.taskId,
    commentId: params.commentId,
    actorId: params.actorId,
    dueDate: params.dueDate,
  });
}

// Job periodico (vedi setInterval in server.ts): nessun parametro utente,
// gira per tutti i task di tutte le company. Stesso join di TASK_SELECT in
// taskService.ts per risolvere lo stato leggibile (task_status.name) da
// tasks.status.
export async function checkDueDateNotifications(): Promise<void> {
  const result = await pool.query<{ id: string; project_id: string; due_date: Date }>(
    `SELECT t.id, t.project_id, t.due_date
     FROM tasks t
     JOIN task_status ts ON ts.id = t.status
     WHERE t.due_date IS NOT NULL AND t.due_date <= CURRENT_DATE AND ts.name NOT IN ('completed', 'rejected')`,
  );

  for (const row of result.rows) {
    // Un errore su un task (es. progetto eliminato in mezzo al giro) non deve
    // bloccare il controllo degli altri: try/catch per task, solo
    // console.error, mai un throw che interromperebbe l'intero ciclo.
    try {
      await notifyProjectTeam(row.project_id, {
        type: 'task_due',
        taskId: row.id,
        dueDate: formatDateOnly(row.due_date),
      });
    } catch (err) {
      console.error(`Controllo scadenza fallito per il task ${row.id}`, err);
    }
  }
}
