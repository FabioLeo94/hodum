import type { TaskAssignee, TaskStatus } from "./project";

// Forma "flat" di progetti/task/commenti così come restituita dagli endpoint
// di export (GET /users/{id}/export, GET /companies/{id}/export): copia 1:1
// dei modelli backend (backend/src/models/project.ts, task.ts,
// taskComment.ts). Distinta di proposito dai DTO di dominio in project.ts
// (Project con tasks annidati, Task senza projectId): quei tipi sono
// rimodellati per la board dei task, questi sono il payload grezzo che va
// scaricato com'è e, per l'azienda, reimportato com'è.
export interface ExportProject {
  id: string;
  name: string;
  isActive: boolean;
}

export interface ExportTask {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: number;
  dueDate: string | null;
  assignees: TaskAssignee[];
}

export interface ExportTaskWithProject extends ExportTask {
  projectName: string;
}

export interface ExportTaskComment {
  id: string;
  taskId: string;
  projectId: string;
  authorId: string;
  authorUsername: string;
  body: string;
  createdAt: string;
  edited: boolean;
}
