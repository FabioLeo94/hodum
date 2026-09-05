export type TaskStatus = "completed" | "progress" | "review" | "rejected";

// Le quattro azioni del timer di lavorazione (vedi Task.workStartedAt/
// workAccumulatedSeconds/workEndedAt sotto): un comando applicato ai tre
// campi work_* in base al loro valore attuale, non uno stato da impostare.
export type WorkTimerAction = "start" | "pause" | "stop" | "reset";
export interface Project {
  id: string;
  name: string;
  tasks: Task[];
}

export interface TaskAssignee {
  id: string;
  username: string;
}

// 1 = priorità più alta, 10 = più bassa: coerente con il campo omonimo nel
// modello backend (backend/src/models/task.ts).
export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: number;
  // Stringa YYYY-MM-DD, o null se il task non ha una scadenza impostata.
  dueDate: string | null;
  assignees: TaskAssignee[];
  // Timer di lavorazione (backend/src/models/task.ts): tre campi derivati,
  // non uno stato esplicito. workStartedAt non-null solo mentre il timer sta
  // girando; workAccumulatedSeconds somma i segmenti già chiusi da
  // pausa/termina; workEndedAt è il timestamp dell'ultima terminazione
  // (manuale o automatica su completed/rejected) e resta valorizzato finché
  // non arriva un reset esplicito.
  workStartedAt: string | null;
  workAccumulatedSeconds: number;
  workEndedAt: string | null;
}

// Usato solo dalla vista calendario aggregata della dashboard (getAllCompanyTasks):
// il progetto è implicito ovunque un Task viva dentro Project.tasks, ma qui i
// task di più progetti convivono nella stessa lista.
export interface TaskWithProject extends Task {
  projectId: string;
  projectName: string;
}

export interface TaskComment {
  id: string;
  taskId: string;
  authorId: string;
  authorUsername: string;
  body: string;
  createdAt: string;
  edited: boolean;
}
