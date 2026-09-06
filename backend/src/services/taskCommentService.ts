import { pool } from '../db/pool';
import type { TaskComment } from '../models/taskComment';
import { getProjectById } from './projectService';
import { TaskNotFoundError } from './taskService';
import { assertNonEmpty } from '../utils/validation';
import { isValidUuid } from '../utils/uuid';
import { AuthorizationError } from '../middleware/authentication';
import { emitTaskCommentCreated, emitTaskCommentDeleted, emitTaskCommentUpdated } from '../realtime/io';
import { notifyProjectTeam } from './notificationService';

export { ProjectNotFoundError } from './projectService';
export { TaskNotFoundError } from './taskService';

// Stesso pattern di TaskNotFoundError: segnala "0 righe trovate" al
// chiamante senza che il service conosca HTTP, il controller intercetta e
// decide lo status (404).
export class CommentNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Commento con id ${id} non trovato`);
    this.name = 'CommentNotFoundError';
  }
}

// Forma della riga così come esce dalla JOIN con tasks e users: snake_case,
// coerente con lo schema (migration 0020_task_comments). author_display_name
// viene dalla JOIN su users, non da task_comments direttamente: il nome
// utente può cambiare nel tempo, un commento vecchio mostra sempre l'ultimo
// display name noto (username, o "nome cognome" se assente, migrations/0041)
// invece di uno snapshot congelato al momento della scrittura.
interface TaskCommentRow {
  id: string;
  task_id: string;
  project_id: string;
  author_id: string;
  author_display_name: string;
  body: string;
  created_at: string;
  edited: boolean;
}

// Select condivisa da listCommentsByTask, createComment e updateComment (per
// ri-selezionare la riga appena scritta con la stessa forma): stesso pattern
// di TASK_SELECT in taskService.ts, cambia solo il filtro WHERE.
const TASK_COMMENT_SELECT = `SELECT tc.id, tc.task_id, t.project_id, tc.author_id,
       COALESCE(NULLIF(u.username, ''), u.first_name || ' ' || u.last_name) AS author_display_name,
       tc.body, tc.created_at, tc.edited
     FROM task_comments tc
     JOIN tasks t ON t.id = tc.task_id
     JOIN users u ON u.id = tc.author_id`;

function toTaskComment(row: TaskCommentRow): TaskComment {
  return {
    id: row.id,
    taskId: row.task_id,
    projectId: row.project_id,
    authorId: row.author_id,
    authorDisplayName: row.author_display_name,
    body: row.body,
    createdAt: row.created_at,
    edited: row.edited,
  };
}

// Verifica che il task esista e appartenga al progetto indicato: chiamata sia
// da listCommentsByTask sia da createComment, prima di leggere/scrivere
// commenti. getProjectById (chiamata da entrambe prima di questa) copre già
// "il progetto esiste ed è della company giusta"; questa copre il livello
// sotto, "il task esiste in QUEL progetto" — un taskId valido ma di un altro
// progetto (anche della stessa company) non deve risultare accessibile solo
// perché l'id combacia in tabella.
async function assertTaskExistsInProject(projectId: string, taskId: string): Promise<void> {
  if (!isValidUuid(taskId)) {
    throw new TaskNotFoundError(taskId);
  }
  const result = await pool.query('SELECT 1 FROM tasks WHERE id = $1 AND project_id = $2', [taskId, projectId]);
  if (result.rowCount === 0) {
    throw new TaskNotFoundError(taskId);
  }
}

export async function listCommentsByTask(
  projectId: string,
  taskId: string,
  companyId?: string | null,
): Promise<TaskComment[]> {
  // Stesso ordine di controlli di taskService.ts: prima il progetto (esiste ed
  // è della company del richiedente), poi il task al suo interno.
  await getProjectById(projectId, companyId);
  await assertTaskExistsInProject(projectId, taskId);

  // ORDER BY created_at ASC (più vecchio in alto, come una chat): a differenza
  // di TASK_SELECT non c'è un secondo criterio di ordinamento, created_at ha
  // sempre un valore (NOT NULL DEFAULT now()) e non può ripetersi in un modo
  // che renda l'ordine ambiguo dal punto di vista dell'utente.
  const result = await pool.query<TaskCommentRow>(`${TASK_COMMENT_SELECT} WHERE tc.task_id = $1 ORDER BY tc.created_at ASC`, [
    taskId,
  ]);
  return result.rows.map(toTaskComment);
}

// Usata solo da exportService.exportUserData: tutti i commenti scritti da un
// utente, indipendentemente da progetto/task, per l'export self-service dei
// propri dati. Nessun controllo di company qui (a differenza di
// listCommentsByTask sopra): il chiamante passa già l'id dell'utente
// autenticato, non un id arbitrario ricevuto dal client.
export async function listCommentsByAuthor(authorId: string): Promise<TaskComment[]> {
  const result = await pool.query<TaskCommentRow>(
    `${TASK_COMMENT_SELECT} WHERE tc.author_id = $1 ORDER BY tc.created_at ASC`,
    [authorId],
  );
  return result.rows.map(toTaskComment);
}

// Usata solo da exportService.exportCompanyData: tutti i commenti dell'intera
// azienda, a prescindere da chi li ha scritti. JOIN aggiuntivo su projects
// (TASK_COMMENT_SELECT si ferma a tasks) perché company_id vive lì, non su
// task_comments né su tasks.
export async function listCommentsByCompany(companyId: string): Promise<TaskComment[]> {
  const result = await pool.query<TaskCommentRow>(
    `${TASK_COMMENT_SELECT} JOIN projects p ON p.id = t.project_id WHERE p.company_id = $1 ORDER BY tc.created_at ASC`,
    [companyId],
  );
  return result.rows.map(toTaskComment);
}

export async function createComment(
  projectId: string,
  taskId: string,
  authorId: string,
  body: string,
  companyId?: string | null,
): Promise<TaskComment> {
  // Punto 2 della code review "niente logica nei controller": tsoa valida
  // che "body" sia una stringa (campo non opzionale), ma non che non sia
  // vuota dopo trim, prima un controllo identico in
  // taskCommentController.createTaskComment.
  assertNonEmpty(body, 'body', 'il commento non può essere vuoto');

  // Stessi controlli di listCommentsByTask: senza, un projectId/taskId
  // inesistente o di un'altra company/progetto inserirebbe comunque la riga
  // (task_id è FK-validato dal DB, ma project_id non lo confermerebbe).
  await getProjectById(projectId, companyId);
  await assertTaskExistsInProject(projectId, taskId);

  const inserted = await pool.query<{ id: string }>(
    'INSERT INTO task_comments (task_id, author_id, body) VALUES ($1, $2, $3) RETURNING id',
    [taskId, authorId, body],
  );
  // Ri-seleziona con la JOIN invece di comporre a mano il risultato: serve ad
  // author_display_name (non disponibile sull'INSERT, che tocca solo
  // task_comments) e a created_at (DEFAULT now() lato DB, non noto prima
  // dell'insert).
  const result = await pool.query<TaskCommentRow>(`${TASK_COMMENT_SELECT} WHERE tc.id = $1`, [inserted.rows[0].id]);
  const comment = toTaskComment(result.rows[0]);
  emitTaskCommentCreated(comment);
  // Un bug nelle notifiche non deve mai far fallire la creazione del
  // commento (stesso principio già applicato a joinProjectRoom in
  // realtime/io.ts): try/catch con solo console.error, mai un throw.
  try {
    await notifyProjectTeam(projectId, { type: 'task_comment', actorId: authorId, taskId, commentId: comment.id });
  } catch (err) {
    console.error('Notifica task_comment fallita', err);
  }
  return comment;
}

// Verifica che il commento esista sotto QUEL task (stessa ragione di
// assertTaskExistsInProject: un commentId valido ma di un altro task non deve
// risultare modificabile solo perché l'id combacia in tabella) e che
// authorId ne sia l'autore. Chiamata sia da updateComment sia da
// deleteComment, dopo assertTaskExistsInProject: solo l'autore può
// modificare o eliminare un proprio commento, nessuna eccezione per owner o
// project manager in questa iterazione.
async function assertCommentAuthor(taskId: string, commentId: string, authorId: string): Promise<void> {
  if (!isValidUuid(commentId)) {
    throw new CommentNotFoundError(commentId);
  }
  const result = await pool.query<{ author_id: string }>('SELECT author_id FROM task_comments WHERE id = $1 AND task_id = $2', [
    commentId,
    taskId,
  ]);
  if (result.rowCount === 0) {
    throw new CommentNotFoundError(commentId);
  }
  if (result.rows[0].author_id !== authorId) {
    throw new AuthorizationError('Solo l\'autore può modificare o eliminare questo commento');
  }
}

export async function updateComment(
  projectId: string,
  taskId: string,
  commentId: string,
  authorId: string,
  body: string,
  companyId?: string | null,
): Promise<TaskComment> {
  // Stesso principio di createComment sopra.
  assertNonEmpty(body, 'body', 'il commento non può essere vuoto');

  await getProjectById(projectId, companyId);
  await assertTaskExistsInProject(projectId, taskId);
  await assertCommentAuthor(taskId, commentId, authorId);

  await pool.query('UPDATE task_comments SET body = $1, edited = true WHERE id = $2', [body, commentId]);
  // Ri-seleziona con la JOIN invece di comporre a mano il risultato: stesso
  // motivo di createComment (author_display_name non disponibile sull'UPDATE).
  const result = await pool.query<TaskCommentRow>(`${TASK_COMMENT_SELECT} WHERE tc.id = $1`, [commentId]);
  const comment = toTaskComment(result.rows[0]);
  emitTaskCommentUpdated(comment);
  return comment;
}

export async function deleteComment(
  projectId: string,
  taskId: string,
  commentId: string,
  authorId: string,
  companyId?: string | null,
): Promise<void> {
  await getProjectById(projectId, companyId);
  await assertTaskExistsInProject(projectId, taskId);
  await assertCommentAuthor(taskId, commentId, authorId);

  await pool.query('DELETE FROM task_comments WHERE id = $1', [commentId]);
  emitTaskCommentDeleted(projectId, taskId, commentId);
}
