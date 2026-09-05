import { pool } from '../db/pool';
import type { Task, TaskAssignee, TaskStatus, TaskWithProject } from '../models/task';
import { getProjectById } from './projectService';
import { isValidUuid } from '../utils/uuid';
import { formatDateOnly } from '../utils/dateOnly';
import { emitTaskCreated, emitTaskDeleted, emitTaskUpdated } from '../realtime/io';
import { notifyProjectTeam, notifyUsers } from './notificationService';
import { UserNotFoundError } from './userService';

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
// Esportata per companyService.importCompanyData, che deve risolvere lo
// stesso slug->nome quando reinserisce i task di un'azienda importata, senza
// duplicare qui la mappa.
export const SLUG_TO_STATUS_NAME: Record<TaskStatus, string> = {
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

// Stessa forma di TASK_SELECT più p.name: usata solo da listTasksByCompany,
// che a differenza di TASK_SELECT deve comunque sapere a quale progetto
// appartiene ogni riga (qui i task di più progetti convivono nello stesso
// risultato).
const TASK_WITH_PROJECT_SELECT = `SELECT t.id, t.project_id, t.title, t.description, t.priority, t.due_date, ts.name AS status_name, p.name AS project_name
     FROM tasks t
     JOIN task_status ts ON ts.id = t.status
     JOIN projects p ON p.id = t.project_id`;

// Stessa forma di TASK_WITH_PROJECT_SELECT più t.status_changed_at: usata
// solo da listStaleTasks, l'unica query che deve sapere da quanto tempo un
// task è fermo nello stato attuale (le altre non ne hanno bisogno, quindi non
// è nella select condivisa).
const STALE_TASK_SELECT = `SELECT t.id, t.project_id, t.title, t.description, t.priority, t.due_date, ts.name AS status_name, p.name AS project_name, t.status_changed_at
     FROM tasks t
     JOIN task_status ts ON ts.id = t.status
     JOIN projects p ON p.id = t.project_id`;

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

function toTask(row: TaskRow, assignees: TaskAssignee[]): Task {
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
    assignees,
  };
}

interface TaskWithProjectRow extends TaskRow {
  project_name: string;
}

function toTaskWithProject(row: TaskWithProjectRow, assignees: TaskAssignee[]): TaskWithProject {
  return { ...toTask(row, assignees), projectName: row.project_name };
}

// Riga di STALE_TASK_SELECT: come TaskWithProjectRow più status_changed_at,
// che il driver pg restituisce come Date (colonna timestamptz) esattamente
// come già avviene per due_date (vedi commento su TaskRow).
interface StaleTaskRow extends TaskWithProjectRow {
  status_changed_at: Date;
}

// Bulk, non N+1: una sola query per l'intero elenco di task_id invece di una
// per task (stesso principio del bulk insert via unnest in
// projectAssignmentService.ts). ANY($1) su un array vuoto è comunque valido
// in Postgres (0 righe), ma evitiamo il round-trip a vuoto quando il
// chiamante non ha nemmeno un task da risolvere.
async function loadAssigneesByTaskIds(taskIds: string[]): Promise<Map<string, TaskAssignee[]>> {
  const result = new Map<string, TaskAssignee[]>();
  if (taskIds.length === 0) {
    return result;
  }
  const rows = await pool.query<{ task_id: string; id: string; username: string }>(
    `SELECT ta.task_id, u.id, u.username
     FROM task_assignments ta JOIN users u ON u.id = ta.user_id
     WHERE ta.task_id = ANY($1::uuid[])
     ORDER BY u.username`,
    [taskIds],
  );
  for (const row of rows.rows) {
    const assignee: TaskAssignee = { id: row.id, username: row.username };
    const existing = result.get(row.task_id);
    if (existing) {
      existing.push(assignee);
    } else {
      result.set(row.task_id, [assignee]);
    }
  }
  return result;
}

async function getTaskById(id: string): Promise<Task> {
  const result = await pool.query<TaskRow>(`${TASK_SELECT} WHERE t.id = $1`, [id]);
  const row = result.rows[0];
  if (!row) {
    throw new TaskNotFoundError(id);
  }
  const assigneesByTaskId = await loadAssigneesByTaskIds([id]);
  return toTask(row, assigneesByTaskId.get(id) ?? []);
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
  // Un'unica query bulk per l'intera lista invece di una per riga (N+1): vedi
  // loadAssigneesByTaskIds.
  const assigneesByTaskId = await loadAssigneesByTaskIds(result.rows.map((row) => row.id));
  return result.rows.map((row) => toTask(row, assigneesByTaskId.get(row.id) ?? []));
}

// Usata solo da GET /tasks (companyTasksController.ts), la vista calendario
// aggregata della dashboard: a differenza di listTasksByProject non riceve un
// projectId da un client, quindi non serve un check di esistenza/ownership
// separato (getProjectById/assertProjectAccessible) — lo scoping per company
// è già garantito dal JOIN su projects filtrato per company_id, stesso
// principio del ramo companyId di listProjects in projectService.ts.
// assignedToUserId, se presente, applica lo stesso restringimento ai soli
// progetti assegnati che listProjects usa per il dipendente (vedi
// projectController.ts): un dipendente deve vedere nel calendario solo i
// task dei progetti a cui è assegnato, non l'intera company.
export async function listTasksByCompany(
  companyId: string | null,
  assignedToUserId?: string,
): Promise<TaskWithProject[]> {
  const result =
    assignedToUserId !== undefined
      ? await pool.query<TaskWithProjectRow>(
          `${TASK_WITH_PROJECT_SELECT}
           JOIN project_assignments pa ON pa.project_id = p.id AND pa.user_id = $2
           WHERE p.company_id = $1
           ORDER BY t.creation_date NULLS LAST, t.title`,
          [companyId, assignedToUserId],
        )
      : await pool.query<TaskWithProjectRow>(
          `${TASK_WITH_PROJECT_SELECT}
           WHERE p.company_id = $1
           ORDER BY t.creation_date NULLS LAST, t.title`,
          [companyId],
        );
  const assigneesByTaskId = await loadAssigneesByTaskIds(result.rows.map((row) => row.id));
  return result.rows.map((row) => toTaskWithProject(row, assigneesByTaskId.get(row.id) ?? []));
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: number;
  dueDate?: string | null;
  // Assegnatari iniziali, opzionali: se presente e non vuoto, createTask
  // richiama setTaskAssignees dopo l'insert (vedi sotto), che si occupa anche
  // della notifica 'task_assigned'.
  assigneeIds?: string[];
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
  let task = await getTaskById(result.rows[0].id);
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
  if (input.assigneeIds && input.assigneeIds.length > 0) {
    // Il set "precedente" letto dentro setTaskAssignees sarà vuoto (task
    // appena creato): ogni id passato risulta quindi "nuovo assegnato" e
    // riceve la notifica task_assigned, senza duplicare qui quella logica.
    task = await setTaskAssignees(projectId, task.id, input.assigneeIds, companyId, actorId);
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

  // Letto PRIMA dell'UPDATE, stesso principio di previousIds in
  // setTaskAssignees più sotto in questo file: serve a calcolare la
  // transizione di stato confrontando il valore attuale con quello in arrivo,
  // cosa che l'UPDATE da solo non può fare senza una CTE. Stesso filtro
  // id+project_id della query sotto, quindi se non trova la riga è lo stesso
  // "non trovato" che altrimenti emergerebbe solo dal rowCount === 0
  // dell'UPDATE.
  const currentResult = await pool.query<{ status_name: string }>(
    `SELECT ts.name AS status_name FROM tasks t JOIN task_status ts ON ts.id = t.status WHERE t.id = $1 AND t.project_id = $2`,
    [taskId, projectId],
  );
  const currentRow = currentResult.rows[0];
  if (!currentRow) {
    throw new TaskNotFoundError(taskId);
  }
  const isRealTransition = currentRow.status_name !== statusName;

  // Stesso pattern di SET clause condizionale di updateTask per dueDate:
  // status_changed_at si aggiorna SOLO su una transizione reale (una
  // chiamata ridondante con lo stesso stato non deve "resettare l'orologio"
  // di quanto un task è fermo). completed_at si valorizza solo entrando in
  // "completed" da un altro stato, e si azzera solo uscendo da "completed"
  // verso un altro stato: se la transizione è reale ma tra due stati diversi
  // da "completed" su entrambi i lati, completed_at non va toccato affatto.
  const setClauses = ['status = (SELECT id FROM task_status WHERE name = $3)'];
  if (isRealTransition) {
    setClauses.push('status_changed_at = now()');
    if (statusName === 'completed') {
      setClauses.push('completed_at = now()');
    } else if (currentRow.status_name === 'completed') {
      setClauses.push('completed_at = NULL');
    }
  }

  // Il filtro su project_id impedisce di spostare un task passando l'id del
  // progetto sbagliato nell'URL (project_id non combacia -> 0 righe -> 404,
  // non un aggiornamento silenzioso su un task di un altro progetto).
  const result = await pool.query(
    `UPDATE tasks
     SET ${setClauses.join(', ')}
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

// Replace-all, stesso pattern di setProjectAssignments in
// projectAssignmentService.ts: il chiamante invia l'intero set di
// assegnatari che il task deve avere, non un delta.
export async function setTaskAssignees(
  projectId: string,
  taskId: string,
  userIds: string[],
  companyId: string | null | undefined,
  actorId: string,
): Promise<Task> {
  // Verifica che il progetto esista e appartenga alla company del
  // richiedente, stesso controllo di updateTask/updateTaskStatus.
  await getProjectById(projectId, companyId);
  if (!isValidUuid(taskId)) {
    throw new TaskNotFoundError(taskId);
  }

  const uniqueIds = [...new Set(userIds)];
  const invalidId = uniqueIds.find((id) => !isValidUuid(id));
  if (invalidId) {
    throw new UserNotFoundError(invalidId);
  }

  const client = await pool.connect();
  // Letto PRIMA della DELETE sotto, stesso motivo di previousProjectIds in
  // setProjectAssignments: serve a distinguere dopo il COMMIT gli
  // assegnatari davvero nuovi da un resend della stessa checklist, solo i
  // primi devono generare una notifica 'task_assigned'.
  let previousIds: Set<string>;
  try {
    await client.query('BEGIN');

    // Verifica che il task esista e appartenga al progetto: dentro la
    // transazione, così un id inesistente fa fallire (e fare ROLLBACK) tutto
    // il resto invece di lasciare una DELETE/INSERT orfana.
    const taskResult = await client.query('SELECT 1 FROM tasks WHERE id = $1 AND project_id = $2', [
      taskId,
      projectId,
    ]);
    if (taskResult.rowCount === 0) {
      throw new TaskNotFoundError(taskId);
    }

    const previousResult = await client.query<{ user_id: string }>(
      'SELECT user_id FROM task_assignments WHERE task_id = $1',
      [taskId],
    );
    previousIds = new Set(previousResult.rows.map((row) => row.user_id));

    if (uniqueIds.length > 0) {
      // Verifica che ogni id fornito sia un dipendente della company del
      // richiedente: senza, si potrebbe assegnare un task a uno user di
      // un'altra azienda conoscendone solo l'id (stesso controllo di
      // setProjectAssignments, ma sugli user invece che sui progetti).
      const ownedResult = await client.query<{ id: string }>(
        'SELECT id FROM users WHERE id = ANY($1::uuid[]) AND company_id = $2',
        [uniqueIds, companyId],
      );
      const ownedIds = new Set(ownedResult.rows.map((row) => row.id));
      const missingId = uniqueIds.find((id) => !ownedIds.has(id));
      if (missingId) {
        throw new UserNotFoundError(missingId);
      }
    }

    await client.query('DELETE FROM task_assignments WHERE task_id = $1 AND NOT (user_id = ANY($2::uuid[]))', [
      taskId,
      uniqueIds,
    ]);
    if (uniqueIds.length > 0) {
      // Un solo round-trip invece di uno per assegnatario, stesso principio
      // dell'INSERT via unnest in setProjectAssignments.
      await client.query(
        `INSERT INTO task_assignments (task_id, user_id)
         SELECT $1, uid FROM unnest($2::uuid[]) AS uid
         ON CONFLICT DO NOTHING`,
        [taskId, uniqueIds],
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const task = await getTaskById(taskId);
  emitTaskUpdated(task);

  // Solo gli id assenti nel set letto prima della DELETE (una checklist
  // risalvata invariata non deve rispedire la notifica) e mai l'autore
  // dell'operazione (non ha senso notificare sé stessi di un'assegnazione
  // fatta da sé stessi).
  const newlyAssignedIds = uniqueIds.filter((id) => !previousIds.has(id) && id !== actorId);
  if (newlyAssignedIds.length > 0 && companyId) {
    // Un bug nelle notifiche non deve mai far fallire l'assegnazione, già
    // committata sopra: stesso try/catch con solo console.error di
    // setProjectAssignments.
    try {
      await notifyUsers(newlyAssignedIds, {
        companyId,
        type: 'task_assigned',
        taskId,
        projectId: task.projectId,
        actorId,
      });
    } catch (err) {
      console.error('Notifica task_assigned fallita', err);
    }
  }

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

// Consumate solo da assistantService.ts (i tool get_stale_tasks/
// get_completion_trend): a differenza di Task/TaskWithProject in
// models/task.ts, questi due tipi non sono esposti da alcun controller REST,
// quindi restano locali qui invece di finire nel modello condiviso.
export interface StaleTask extends TaskWithProject {
  // Timestamp completo (non una data sola come dueDate): a differenza di
  // due_date, status_changed_at è un timestamptz dove l'ora conta (due task
  // "fermi da 7 giorni" possono differire di ore), quindi una stringa ISO
  // completa via toISOString() invece di formatDateOnly, che tronca l'ora.
  statusChangedAt: string;
  daysSinceStatusChange: number;
}

// Usata dal tool "get_stale_tasks" dell'assistente per individuare task
// aperti (non completed/rejected: quelli sono terminali, "fermi" per
// definizione, non "abbandonati") che non cambiano stato da troppo tempo.
// Stesso principio di bulk-loading di listTasksByCompany: una query per
// l'elenco più una per gli assegnatari (loadAssigneesByTaskIds), niente N+1.
export async function listStaleTasks(
  companyId: string | null,
  thresholdDays: number,
  projectId?: string,
): Promise<StaleTask[]> {
  // Stesso pattern di SET/WHERE clause condizionale di updateTask per
  // dueDate: il filtro su project_id si aggiunge solo se il chiamante lo ha
  // fornito, invece di obbligare sempre a uno scope di singolo progetto.
  const values: unknown[] = [companyId, thresholdDays];
  let projectFilter = '';
  if (projectId !== undefined) {
    values.push(projectId);
    projectFilter = ` AND t.project_id = $${values.length}`;
  }

  const result = await pool.query<StaleTaskRow>(
    `${STALE_TASK_SELECT}
     WHERE p.company_id = $1
       AND ts.name IN ('in progress', 'review')
       AND t.status_changed_at < now() - ($2 || ' days')::interval${projectFilter}
     ORDER BY t.status_changed_at ASC`,
    values,
  );
  const assigneesByTaskId = await loadAssigneesByTaskIds(result.rows.map((row) => row.id));
  const now = Date.now();
  return result.rows.map((row) => {
    const task = toTaskWithProject(row, assigneesByTaskId.get(row.id) ?? []);
    // Arrotondato a un intero di giorni: coerente con thresholdDays, che è
    // anch'esso un numero intero di giorni, non con la precisione in ore del
    // timestamp sottostante.
    const daysSinceStatusChange = Math.round((now - row.status_changed_at.getTime()) / (1000 * 60 * 60 * 24));
    return { ...task, statusChangedAt: row.status_changed_at.toISOString(), daysSinceStatusChange };
  });
}

export interface CompletionTrendPoint {
  // YYYY-MM-DD: qui invece formatDateOnly è corretto, perché date_trunc
  // riduce già il timestamp a un confine di settimana/mese, l'ora residua
  // (sempre mezzanotte) non porta informazione.
  periodStart: string;
  completedCount: number;
}

// Usata dal tool "get_completion_trend" dell'assistente. granularity è
// tipizzata TS ('week' | 'month', vincolata anche lato tool schema in
// assistantService.ts a un enum chiuso) prima di arrivare qui: passata come
// parametro SQL a date_trunc($2, ...) invece che concatenata a mano nella
// stringa, ma essendo comunque ristretta a due valori noti a tempo di
// compilazione (non input utente diretto) non serve una validazione
// aggiuntiva in questa funzione.
export async function getCompletionTrend(
  companyId: string | null,
  granularity: 'week' | 'month',
  projectId?: string,
): Promise<CompletionTrendPoint[]> {
  const values: unknown[] = [companyId, granularity];
  let projectFilter = '';
  if (projectId !== undefined) {
    values.push(projectId);
    projectFilter = ` AND t.project_id = $${values.length}`;
  }

  // COUNT(*)::int, stesso cast già usato in notificationService.ts: senza,
  // il driver pg restituirebbe un bigint come stringa (per non perdere
  // precisione su valori enormi), che qui non serve dato il volume atteso.
  const result = await pool.query<{ period_start: Date; completed_count: number }>(
    `SELECT date_trunc($2, t.completed_at) AS period_start, COUNT(*)::int AS completed_count
     FROM tasks t
     JOIN projects p ON p.id = t.project_id
     WHERE p.company_id = $1
       AND t.completed_at IS NOT NULL${projectFilter}
     GROUP BY period_start
     ORDER BY period_start`,
    values,
  );
  return result.rows.map((row) => ({
    periodStart: formatDateOnly(row.period_start),
    completedCount: row.completed_count,
  }));
}

// Confronto a livello di giorno intero, non di millisecondi grezzi: sottrarre
// direttamente due Date.getTime() e dividere per 86400000 si rompe quando in
// mezzo cade un cambio ora legale (un giorno locale non è sempre esattamente
// 24h). Si estraggono invece i componenti di calendario locali di ciascuna
// data (stesso principio del round-trip via componenti già usato in
// isValidDueDate sopra, qui applicato a due oggetti Date reali invece che a
// una stringa) e si ricostruiscono entrambe come mezzanotte UTC dello stesso
// giorno: in UTC l'aritmetica in millisecondi è sempre pulita perché non
// esiste ora legale.
function daysBetweenCalendarDates(from: Date, to: Date): number {
  const fromUtc = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const toUtc = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((toUtc - fromUtc) / (1000 * 60 * 60 * 24));
}

// Consumata solo da assistantService.ts (tool "get_due_tasks"), stesso
// trattamento di StaleTask/CompletionTrendPoint sopra: nessun controller REST
// la espone, quindi resta locale qui invece di finire nel modello condiviso.
export interface DueTask extends TaskWithProject {
  // Negativo = in ritardo di N giorni, 0 = scade oggi, positivo = scade tra N
  // giorni. Calcolato a livello di data (non di orario), stesso principio
  // già usato in isValidDueDate per il confronto calendaricale invece che sui
  // millisecondi grezzi (evita off-by-one dovuti al fuso orario locale).
  daysUntilDue: number;
}

// Usata dal tool "get_due_tasks" dell'assistente per individuare task aperti
// (non completed/rejected: un task chiuso non è "in ritardo", è terminato,
// stesso principio già applicato in listStaleTasks) con una scadenza già
// passata o imminente. Il confronto `due_date <= CURRENT_DATE + N giorni` in
// una sola condizione copre sia i task già scaduti (due_date nel passato
// soddisfa comunque la disequazione) sia quelli in scadenza entro withinDays,
// senza bisogno di due filtri separati. Stesso bulk-loading assegnatari e
// stesso filtro opzionale su projectId di listStaleTasks/getCompletionTrend.
export async function listDueTasks(
  companyId: string | null,
  withinDays: number,
  projectId?: string,
): Promise<DueTask[]> {
  const values: unknown[] = [companyId, withinDays];
  let projectFilter = '';
  if (projectId !== undefined) {
    values.push(projectId);
    projectFilter = ` AND t.project_id = $${values.length}`;
  }

  const result = await pool.query<TaskWithProjectRow>(
    `${TASK_WITH_PROJECT_SELECT}
     WHERE p.company_id = $1
       AND ts.name NOT IN ('completed', 'rejected')
       AND t.due_date IS NOT NULL
       AND t.due_date <= CURRENT_DATE + ($2 || ' days')::interval${projectFilter}
     ORDER BY t.due_date ASC`,
    values,
  );
  const assigneesByTaskId = await loadAssigneesByTaskIds(result.rows.map((row) => row.id));
  const today = new Date();
  return result.rows.map((row) => {
    const task = toTaskWithProject(row, assigneesByTaskId.get(row.id) ?? []);
    // row.due_date non è mai null qui (filtrato in WHERE), ma la colonna resta
    // tipizzata `Date | null` in TaskRow: il non-null assertion documenta
    // esplicitamente questa garanzia della query invece di un cast silenzioso.
    const daysUntilDue = daysBetweenCalendarDates(today, row.due_date as Date);
    return { ...task, daysUntilDue };
  });
}
