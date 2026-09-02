import { pool } from '../db/pool';
import type { Task, TaskStatus } from '../models/task';
import { getProjectById } from './projectService';
import { isValidUuid } from '../utils/uuid';
import { formatDateOnly } from '../utils/dateOnly';
import { emitTaskCreated, emitTaskDeleted, emitTaskUpdated } from '../realtime/io';
import { notifyProjectTeam } from './notificationService';

export { ProjectNotFoundError } from './projectService';

// Stesso pattern di ProjectNotFoundError: segnala "0 righe trovate/modificate"
// al chiamante senza che il service conosca HTTP, il controller intercetta e
// decide lo status (404).
export class TaskNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Task con id ${id} non trovato`);
    this.name = 'TaskNotFoundError';
  }
}

// Forma della riga così come esce dalla JOIN con task_status: snake_case,
// coerente con lo schema in migrations/0002_baseline_schema_esistente.sql.
interface TaskRow {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status_name: string;
  priority: number;
  // Il driver pg converte sempre le colonne `date` (OID 1082) in un oggetto
  // Date a runtime, indipendentemente dal tipo dichiarato qui (nessun
  // setTypeParser custom in src/db): tipizzato Date per rispecchiare il
  // valore reale, non la colonna SQL.
  due_date: Date | null;
}

// task_status.name (seed in migrations/0004_task_status_smallint_identity_e_seed_stati_assegnabili.sql)
// usa "in progress" mentre il dominio applicativo e il frontend usano lo slug
// "progress": mappatura esplicita invece di derivarla a runtime, così un
// rename di task_status.name non cambia silenziosamente i valori esposti
// dall'API.
const STATUS_NAME_TO_SLUG: Record<string, TaskStatus> = {
  'in progress': 'progress',
  review: 'review',
  completed: 'completed',
  rejected: 'rejected',
};

// Inverso di STATUS_NAME_TO_SLUG: serve a updateTaskStatus per risolvere lo
// slug ricevuto dal client verso il task_status.name usato in colonna.
const SLUG_TO_STATUS_NAME: Record<TaskStatus, string> = {
  progress: 'in progress',
  review: 'review',
  completed: 'completed',
  rejected: 'rejected',
};

// Select condivisa da getTaskById e listTasksByProject: stessa forma di riga
// (TaskRow) per entrambe, cambia solo il filtro WHERE.
const TASK_SELECT = `SELECT t.id, t.project_id, t.title, t.description, t.priority, t.due_date, ts.name AS status_name
     FROM tasks t
     JOIN task_status ts ON ts.id = t.status`;

// 1 = priorità più alta, 10 = più bassa (vedi models/task.ts): stesso vincolo
// del CHECK a livello di DB (migration 0012), ripetuto qui perché un valore
// fuori range deve essere rifiutato dal controller con un 422 prima di
// arrivare alla query, non emergere come un errore generico del driver.
export function isValidPriority(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 10;
}

// Stesso ruolo di isValidPriority ma per lo slug di stato: valida che il
// valore ricevuto dal client sia una delle chiavi note di SLUG_TO_STATUS_NAME
// prima di usarlo in query, invece di lasciarlo risolvere a `undefined` (e
// quindi a un parametro NULL silenzioso) più a valle.
export function isValidTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === 'string' && value in SLUG_TO_STATUS_NAME;
}

// Usata solo quando il valore è presente e non-null (stesso schema di
// isValidPriority): "è null o assente" resta responsabilità del chiamante
// (controller), qui si valida solo il formato di una stringa candidata.
const DUE_DATE_FORMAT = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidDueDate(value: string): boolean {
  const match = DUE_DATE_FORMAT.exec(value);
  if (!match) return false;
  const [, yearStr, monthStr, dayStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  // Un round-trip attraverso Date.UTC rifiuta le date calendaricamente
  // inesistenti (es. 30 febbraio, che Date.UTC accetterebbe silenziosamente
  // "scivolando" a marzo): se anno/mese/giorno non tornano invariati dopo la
  // costruzione, il valore in ingresso non era una data reale.
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function toTask(row: TaskRow): Task {
  const status = STATUS_NAME_TO_SLUG[row.status_name];
  if (!status) {
    throw new Error(`Stato task sconosciuto: ${row.status_name}`);
  }
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    status,
    priority: row.priority,
    dueDate: row.due_date ? formatDateOnly(row.due_date) : null,
  };
}

async function getTaskById(id: string): Promise<Task> {
  const result = await pool.query<TaskRow>(`${TASK_SELECT} WHERE t.id = $1`, [id]);
  const row = result.rows[0];
  if (!row) {
    throw new TaskNotFoundError(id);
  }
  return toTask(row);
}

export async function listTasksByProject(projectId: string, companyId?: string | null): Promise<Task[]> {
  // Verifica esistenza del progetto: senza, un id inesistente risponderebbe
  // con una lista vuota indistinguibile da "progetto esistente senza task".
  // getProjectById lancia ProjectNotFoundError, che il controller intercetta
  // per rispondere 404 (stesso pattern di projectController.ts). Passare
  // companyId qui è anche ciò che impedisce a un utente autenticato di
  // un'azienda di leggere i task di un progetto di un'altra azienda
  // conoscendone solo l'id (IDOR cross-tenant, vedi projectService.ts).
  await getProjectById(projectId, companyId);

  const result = await pool.query<TaskRow>(
    `${TASK_SELECT} WHERE t.project_id = $1 ORDER BY t.creation_date NULLS LAST, t.title`,
    [projectId],
  );
  return result.rows.map(toTask);
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: number;
  dueDate?: string | null;
}

export async function createTask(
  projectId: string,
  input: CreateTaskInput,
  actorId: string,
  companyId?: string | null,
): Promise<Task> {
  // Stesso controllo di listTasksByProject: senza, un projectId inesistente
  // (o di un'altra azienda) inserirebbe comunque la riga (project_id è NOT
  // NULL ma non FK-validato qui) invece di rispondere 404.
  await getProjectById(projectId, companyId);

  // Stesso pattern COALESCE di updateTask: status/priority sono opzionali in
  // ingresso, quando non forniti l'INSERT deve comunque produrre lo stesso
  // stato iniziale di prima (id di "in progress", priority 5) invece di
  // lasciare che sia il DEFAULT di colonna a deciderlo — qui serve esplicito
  // perché ora la colonna è sempre valorizzata dalla query, non più omessa.
  // Il parametro $4 è NULL quando status non è fornito: `name = NULL` non
  // matcha mai righe, quindi la subquery esterna del COALESCE cade sul
  // fallback "in progress".
  const result = await pool.query<{ id: string }>(
    `INSERT INTO tasks (project_id, title, description, status, priority, due_date)
     VALUES (
       $1,
       $2,
       $3,
       COALESCE((SELECT id FROM task_status WHERE name = $4), (SELECT id FROM task_status WHERE name = 'in progress')),
       COALESCE($5, 5),
       $6
     )
     RETURNING id`,
    [
      projectId,
      input.title,
      input.description ?? null,
      input.status ? SLUG_TO_STATUS_NAME[input.status] : null,
      input.priority ?? null,
      input.dueDate ?? null,
    ],
  );
  const task = await getTaskById(result.rows[0].id);
  emitTaskCreated(task);
  // Un bug nelle notifiche non deve mai far fallire la creazione del task
  // (stesso principio già applicato a joinProjectRoom in realtime/io.ts):
  // try/catch con solo console.error, mai un throw che risalirebbe al
  // controller come se il task non fosse stato creato.
  try {
    await notifyProjectTeam(projectId, { type: 'task_created', actorId, taskId: task.id });
  } catch (err) {
    console.error('Notifica task_created fallita', err);
  }
  return task;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  // A differenza di title/description, dueDate ha bisogno di una semantica
  // a tre stati: assente (non toccare), null (rimuovi la scadenza), stringa
  // (impostala) — vedi il costruttore di SET clause in updateTask, che per
  // questo campo non può usare il pattern COALESCE degli altri due.
  dueDate?: string | null;
}

export async function updateTask(
  projectId: string,
  taskId: string,
  input: UpdateTaskInput,
  companyId?: string | null,
): Promise<Task> {
  // Verifica che il progetto esista e appartenga alla company del richiedente
  // (getProjectById lancia ProjectNotFoundError altrimenti, intercettata dal
  // controller): senza questo controllo, il filtro WHERE project_id = $2 qui
  // sotto basta a restare dentro il progetto giusto, ma non impedisce di
  // operare su un progetto di un'altra azienda di cui si conosce l'id.
  await getProjectById(projectId, companyId);
  // taskId invece non è coperto da getProjectById: un valore sintatticamente
  // non valido (es. un titolo passato per errore invece dell'uuid, come può
  // capitare all'assistente LLM) va intercettato qui per evitare che la
  // colonna uuid lo rifiuti con un errore del driver ("invalid input syntax
  // for type uuid") invece del consueto TaskNotFoundError.
  if (!isValidUuid(taskId)) {
    throw new TaskNotFoundError(taskId);
  }

  // Stesso pattern COALESCE di updateProject in projectService.ts per
  // title/description: applica solo i campi effettivamente forniti
  // (undefined -> null -> valore colonna invariato) senza concatenare a
  // mano la SET clause in base ai campi presenti. `?? null` scatta solo su
  // undefined (campo non fornito), non su stringa vuota: title/description
  // forniti come '' restano '' e sovrascrivono il valore esistente, stesso
  // trattamento già applicato in createTask.
  //
  // dueDate NON può seguire lo stesso pattern: COALESCE non distingue "non
  // fornito" da "fornito esplicitamente come null" (entrambi arriverebbero
  // come parametro SQL NULL), ma qui serve poter davvero azzerare la
  // scadenza. Il frammento SET va quindi aggiunto solo se il chiamante ha
  // toccato il campo (dueDate !== undefined), scrivendo il valore così com'è
  // (stringa o null) invece di passare per COALESCE.
  const setClauses = ['title = COALESCE($3, title)', 'description = COALESCE($4, description)'];
  const values: unknown[] = [taskId, projectId, input.title ?? null, input.description ?? null];
  if (input.dueDate !== undefined) {
    values.push(input.dueDate);
    setClauses.push(`due_date = $${values.length}`);
  }

  const result = await pool.query(
    `UPDATE tasks
     SET ${setClauses.join(', ')}
     WHERE id = $1 AND project_id = $2`,
    values,
  );
  if (result.rowCount === 0) {
    throw new TaskNotFoundError(taskId);
  }
  const task = await getTaskById(taskId);
  emitTaskUpdated(task);
  return task;
}

export async function updateTaskStatus(
  projectId: string,
  taskId: string,
  status: TaskStatus,
  companyId?: string | null,
): Promise<Task> {
  // Stesso controllo di updateTask: verifica che il progetto appartenga alla
  // company del richiedente prima di toccare i suoi task.
  await getProjectById(projectId, companyId);
  if (!isValidUuid(taskId)) {
    throw new TaskNotFoundError(taskId);
  }

  const statusName = SLUG_TO_STATUS_NAME[status];
  // Il filtro su project_id impedisce di spostare un task passando l'id del
  // progetto sbagliato nell'URL (project_id non combacia -> 0 righe -> 404,
  // non un aggiornamento silenzioso su un task di un altro progetto).
  const result = await pool.query(
    `UPDATE tasks
     SET status = (SELECT id FROM task_status WHERE name = $3)
     WHERE id = $1 AND project_id = $2`,
    [taskId, projectId, statusName],
  );
  if (result.rowCount === 0) {
    throw new TaskNotFoundError(taskId);
  }
  const task = await getTaskById(taskId);
  emitTaskUpdated(task);
  return task;
}

export async function updateTaskPriority(
  projectId: string,
  taskId: string,
  priority: number,
  companyId?: string | null,
): Promise<Task> {
  // Stesso controllo di updateTaskStatus: verifica che il progetto appartenga
  // alla company del richiedente prima di toccare i suoi task.
  await getProjectById(projectId, companyId);
  if (!isValidUuid(taskId)) {
    throw new TaskNotFoundError(taskId);
  }

  const result = await pool.query(
    `UPDATE tasks
     SET priority = $3
     WHERE id = $1 AND project_id = $2`,
    [taskId, projectId, priority],
  );
  if (result.rowCount === 0) {
    throw new TaskNotFoundError(taskId);
  }
  const task = await getTaskById(taskId);
  emitTaskUpdated(task);
  return task;
}

export async function deleteTask(projectId: string, taskId: string, companyId?: string | null): Promise<void> {
  // Stesso controllo di updateTask: verifica che il progetto appartenga alla
  // company del richiedente prima di eliminare un suo task.
  await getProjectById(projectId, companyId);
  if (!isValidUuid(taskId)) {
    throw new TaskNotFoundError(taskId);
  }

  // Stesso filtro su project_id di updateTaskStatus: evita che un id di
  // progetto sbagliato nell'URL elimini un task che appartiene a un altro
  // progetto.
  const result = await pool.query('DELETE FROM tasks WHERE id = $1 AND project_id = $2', [taskId, projectId]);
  if (result.rowCount === 0) {
    throw new TaskNotFoundError(taskId);
  }
  emitTaskDeleted(projectId, taskId);
}
