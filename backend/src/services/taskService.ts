import { pool } from '../db/pool';
import type { Task, TaskStatus } from '../models/task';
import { getProjectById } from './projectService';
import { isValidUuid } from '../utils/uuid';
import { emitTaskCreated, emitTaskDeleted, emitTaskUpdated } from '../realtime/io';

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
const TASK_SELECT = `SELECT t.id, t.project_id, t.title, t.description, t.priority, ts.name AS status_name
     FROM tasks t
     JOIN task_status ts ON ts.id = t.status`;

// 1 = priorità più alta, 10 = più bassa (vedi models/task.ts): stesso vincolo
// del CHECK a livello di DB (migration 0012), ripetuto qui perché un valore
// fuori range deve essere rifiutato dal controller con un 422 prima di
// arrivare alla query, non emergere come un errore generico del driver.
export function isValidPriority(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 10;
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

export async function listTasksByProject(projectId: string): Promise<Task[]> {
  // Verifica esistenza del progetto: senza, un id inesistente risponderebbe
  // con una lista vuota indistinguibile da "progetto esistente senza task".
  // getProjectById lancia ProjectNotFoundError, che il controller intercetta
  // per rispondere 404 (stesso pattern di projectController.ts).
  await getProjectById(projectId);

  const result = await pool.query<TaskRow>(
    `${TASK_SELECT} WHERE t.project_id = $1 ORDER BY t.creation_date NULLS LAST, t.title`,
    [projectId],
  );
  return result.rows.map(toTask);
}

export interface CreateTaskInput {
  title: string;
  description?: string;
}

export async function createTask(projectId: string, input: CreateTaskInput): Promise<Task> {
  // Stesso controllo di listTasksByProject: senza, un projectId inesistente
  // inserirebbe comunque la riga (project_id è NOT NULL ma non FK-validato
  // qui) invece di rispondere 404.
  await getProjectById(projectId);

  // Niente colonna status nell'INSERT: usa il DEFAULT del DB (id di "in
  // progress", vedi migration 0004), che è già lo stato iniziale voluto.
  const result = await pool.query<{ id: string }>(
    'INSERT INTO tasks (project_id, title, description) VALUES ($1, $2, $3) RETURNING id',
    [projectId, input.title, input.description ?? null],
  );
  const task = await getTaskById(result.rows[0].id);
  emitTaskCreated(task);
  return task;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
}

export async function updateTask(projectId: string, taskId: string, input: UpdateTaskInput): Promise<Task> {
  // Un projectId o taskId sintatticamente non validi (es. un titolo passato
  // per errore invece dell'uuid, come può capitare all'assistente LLM) non
  // possono comunque combaciare con nessuna riga: intercettarli qui evita che
  // le colonne uuid li rifiutino con un errore del driver ("invalid input
  // syntax for type uuid"), che altrimenti uscirebbe come eccezione non
  // gestita invece del consueto TaskNotFoundError già previsto dal chiamante.
  if (!isValidUuid(projectId) || !isValidUuid(taskId)) {
    throw new TaskNotFoundError(taskId);
  }

  // Stesso pattern COALESCE di updateProject in projectService.ts: applica
  // solo i campi effettivamente forniti (undefined -> null -> valore colonna
  // invariato) senza concatenare a mano la SET clause in base ai campi
  // presenti. `?? null` scatta solo su undefined (campo non fornito), non su
  // stringa vuota: title/description forniti come '' restano '' e sovrascrivono
  // il valore esistente, stesso trattamento già applicato in createTask.
  const result = await pool.query(
    `UPDATE tasks
     SET title = COALESCE($3, title), description = COALESCE($4, description)
     WHERE id = $1 AND project_id = $2`,
    [taskId, projectId, input.title ?? null, input.description ?? null],
  );
  if (result.rowCount === 0) {
    throw new TaskNotFoundError(taskId);
  }
  const task = await getTaskById(taskId);
  emitTaskUpdated(task);
  return task;
}

export async function updateTaskStatus(projectId: string, taskId: string, status: TaskStatus): Promise<Task> {
  // Stesso guard di updateTask: evita l'errore del driver su un id
  // sintatticamente non valido.
  if (!isValidUuid(projectId) || !isValidUuid(taskId)) {
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

export async function updateTaskPriority(projectId: string, taskId: string, priority: number): Promise<Task> {
  // Stesso guard di updateTaskStatus: evita l'errore del driver su un id
  // sintatticamente non valido.
  if (!isValidUuid(projectId) || !isValidUuid(taskId)) {
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

export async function deleteTask(projectId: string, taskId: string): Promise<void> {
  // Stesso guard di updateTask: evita l'errore del driver su un id
  // sintatticamente non valido.
  if (!isValidUuid(projectId) || !isValidUuid(taskId)) {
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
