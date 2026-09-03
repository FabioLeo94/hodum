export type TaskStatus = "completed" | "progress" | "review" | "rejected";
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
