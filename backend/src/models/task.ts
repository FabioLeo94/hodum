// Stessi slug usati dal frontend (src/shared/types/project.ts): il mapping da
// task_status.name (vedi migrations/0004, es. "in progress") verso questi
// slug vive in taskService.ts, vicino alla query che lo produce.
export type TaskStatus = 'progress' | 'review' | 'completed' | 'rejected';

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
}
