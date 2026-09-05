// Stessi slug usati dal frontend (src/shared/types/project.ts): il mapping da
// task_status.name (vedi migrations/0004, es. "in progress") verso questi
// slug vive in taskService.ts, vicino alla query che lo produce.
export type TaskStatus = 'progress' | 'review' | 'completed' | 'rejected';

// Riga minima del team many-to-many task_assignments JOIN users: stesso
// principio di denormalizzazione di actorUsername in models/notification.ts,
// il frontend mostra lo username senza una query aggiuntiva per assegnatario.
export interface TaskAssignee {
  id: string;
  username: string;
}

// Numerico invece di uno slug come TaskStatus: 1 = priorità più alta, 10 = più
// bassa, coerente con la richiesta di dominio (usato per ordinare, non solo
// per etichettare) invece di un enum semantico chiuso.
export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: number;
  // Sempre una stringa YYYY-MM-DD a questo livello, anche se in DB la
  // colonna è `date` (tasks.due_date): la conversione da/verso il tipo Date
  // che il driver pg restituisce a runtime avviene in taskService.ts.
  dueDate: string | null;
  // Assegnazione many-to-many (task_assignments): ordinati per username,
  // stesso ordine della query bulk in taskService.ts.
  assignees: TaskAssignee[];
  // Timer di lavorazione (migration 0031): tre campi derivati, non uno stato
  // esplicito. workStartedAt non-null solo mentre il timer sta girando;
  // workAccumulatedSeconds somma i segmenti già chiusi da pausa/termina;
  // workEndedAt è il timestamp dell'ultima terminazione (manuale o
  // automatica su completed/rejected, vedi updateTaskStatus in
  // taskService.ts) e resta valorizzato finché non arriva un reset esplicito.
  workStartedAt: string | null;
  workAccumulatedSeconds: number;
  workEndedAt: string | null;
}

// Usato solo dall'endpoint aggregato GET /tasks (companyTasksController.ts):
// il progetto è implicito ovunque un Task venga letto dentro il proprio
// projectId (/projects/{projectId}/tasks), ma qui i task di più progetti
// convivono nella stessa lista e serve il nome per distinguerli in UI.
export interface TaskWithProject extends Task {
  projectName: string;
}
