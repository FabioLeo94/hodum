// Stessi slug usati dal frontend (src/shared/types/project.ts): il mapping da
// task_status.name (vedi migrations/0004, es. "in progress") verso questi
// slug vive in taskService.ts, vicino alla query che lo produce.
export type TaskStatus = 'progress' | 'review' | 'completed' | 'rejected';

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
}
