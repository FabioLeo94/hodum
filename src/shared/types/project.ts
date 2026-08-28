export type TaskStatus = "completed" | "progress" | "review" | "rejected";
export interface Project {
  id: string;
  name: string;
  tasks: Task[];
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
}
