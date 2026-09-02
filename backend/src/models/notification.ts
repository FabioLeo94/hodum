// Forma dell'entità Notification esposta dall'API: camelCase lato
// applicativo, stesso principio di models/task.ts e models/taskComment.ts.
// Il backend invia solo id/riferimenti denormalizzati (projectName, taskTitle,
// actorUsername), MAI un testo già composto ("Mario ha commentato il task
// X"): il frontend costruisce il messaggio da questi campi, così una
// traduzione o un cambio di formato non richiede una migration.
export type NotificationType = 'task_comment' | 'task_created' | 'task_due' | 'project_assigned' | 'task_assigned';

export interface Notification {
  id: string;
  type: NotificationType;
  read: boolean;
  createdAt: string;
  projectId: string | null;
  projectName: string | null;
  taskId: string | null;
  taskTitle: string | null;
  commentId: string | null;
  actorId: string | null;
  actorUsername: string | null;
  dueDate: string | null;
}
