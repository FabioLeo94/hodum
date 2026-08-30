export type TaskStatus = "completed" | "progress" | "review" | "rejected";
export interface Project {
  id: string;
  name: string;
  tasks: Task[];
}

// 1 = priorità più alta, 10 = più bassa: coerente con il campo omonimo nel
// modello backend (backend/src/models/task.ts).
export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: number;
}
