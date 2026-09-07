import type { Project, Task, TaskAssignee, TaskComment, TaskStatus, TaskWithProject, WorkTimerAction } from "../../../shared/types/project";
import { authFetch, authHeader } from "../auth/authService";
import { API_BASE_URL, readErrorMessage } from "../httpClient";

interface ProjectDto {
  id: string;
  name: string;
  isActive: boolean;
  customerId: string | null;
}

interface TaskDto {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: number;
  dueDate: string | null;
  assignees: TaskAssignee[];
  workStartedAt: string | null;
  workAccumulatedSeconds: number;
  workEndedAt: string | null;
  invoiceId: string | null;
}

function toTask(dto: TaskDto): Task {
  return {
    id: dto.id,
    title: dto.title,
    description: dto.description ?? "",
    status: dto.status,
    priority: dto.priority,
    dueDate: dto.dueDate ?? null,
    assignees: dto.assignees,
    workStartedAt: dto.workStartedAt,
    workAccumulatedSeconds: dto.workAccumulatedSeconds,
    workEndedAt: dto.workEndedAt,
    invoiceId: dto.invoiceId,
  };
}

async function fetchProjectTasks(projectId: string): Promise<Task[]> {
  const response = await authFetch(`${API_BASE_URL}/projects/${projectId}/tasks`, { headers: authHeader() });
  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message ?? "Impossibile caricare i task del progetto.");
  }
  const tasks = (await response.json()) as TaskDto[];
  return tasks.map(toTask);
}

export async function getAllProjects(): Promise<Project[]> {
  const response = await authFetch(`${API_BASE_URL}/projects`, { headers: authHeader() });
  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message ?? "Impossibile caricare i progetti.");
  }
  const projects = (await response.json()) as ProjectDto[];

  return Promise.all(
    projects.map(async (project) => ({
      id: project.id,
      name: project.name,
      customerId: project.customerId,
      tasks: await fetchProjectTasks(project.id),
    })),
  );
}

interface TaskWithProjectDto extends TaskDto {
  projectName: string;
}

// A differenza di toTask, mantiene projectId/projectName invece di scartarli:
// la vista calendario aggregata della dashboard mostra task di più progetti
// insieme, quindi le servono per etichettare ogni task e per navigare al
// progetto giusto (vedi TaskDetailModalComponent).
function toTaskWithProject(dto: TaskWithProjectDto): TaskWithProject {
  return { ...toTask(dto), projectId: dto.projectId, projectName: dto.projectName };
}

// Tutti i task di tutti i progetti della company (calendario aggregato della
// dashboard): un dipendente riceve solo i task dei propri progetti assegnati,
// owner/manager tutta la company (filtro applicato lato backend, vedi
// companyTasksController.ts).
export async function getAllCompanyTasks(): Promise<TaskWithProject[]> {
  const response = await authFetch(`${API_BASE_URL}/tasks`, { headers: authHeader() });
  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message ?? "Impossibile caricare i task dell'azienda.");
  }
  const tasks = (await response.json()) as TaskWithProjectDto[];
  return tasks.map(toTaskWithProject);
}

// Solo id e nome di tutti i progetti della company, senza i task: usata dalla
// checklist di assegnazione progetti (sub-pannello del popover kebab in
// EmployeeCardComponent), che non ha bisogno dei task e altrimenti
// pagherebbe la fetchProjectTasks per progetto già fatta da getAllProjects.
export interface ProjectSummary {
  id: string;
  name: string;
}

export async function listProjectsSummary(): Promise<ProjectSummary[]> {
  const response = await authFetch(`${API_BASE_URL}/projects`, { headers: authHeader() });
  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message ?? "Impossibile caricare i progetti.");
  }
  const projects = (await response.json()) as ProjectDto[];
  return projects.map((project) => ({ id: project.id, name: project.name }));
}

// Solo il nome, senza i task: usata dove serve un'etichetta leggibile (es. il
// toggle "contesto" dell'assistente) senza pagare la fetchProjectTasks di
// getProjectById.
export async function getProjectName(id: string): Promise<string | undefined> {
  const response = await authFetch(`${API_BASE_URL}/projects/${id}`, { headers: authHeader() });
  if (response.status === 404) {
    return undefined;
  }
  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message ?? "Impossibile caricare il progetto.");
  }
  const project = (await response.json()) as ProjectDto;
  return project.name;
}

export async function getProjectById(id: string): Promise<Project | undefined> {
  const response = await authFetch(`${API_BASE_URL}/projects/${id}`, { headers: authHeader() });
  if (response.status === 404) {
    return undefined;
  }
  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message ?? "Impossibile caricare il progetto.");
  }
  const project = (await response.json()) as ProjectDto;
  const tasks = await fetchProjectTasks(id);
  return { id: project.id, name: project.name, customerId: project.customerId, tasks };
}

export async function createProject(name: string): Promise<Project> {
  const response = await authFetch(`${API_BASE_URL}/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message ?? "Impossibile creare il progetto.");
  }
  const project = (await response.json()) as ProjectDto;
  return { id: project.id, name: project.name, customerId: project.customerId, tasks: [] };
}

export interface UpdateProjectInput {
  name: string;
  // null scollega il progetto dal cliente assegnato in precedenza (vedi
  // UpdateProjectInput.customerId lato backend, projectService.ts).
  customerId: string | null;
}

export async function updateProject(
  id: string,
  input: UpdateProjectInput,
): Promise<Pick<Project, "id" | "name" | "customerId">> {
  const response = await authFetch(`${API_BASE_URL}/projects/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message ?? "Impossibile aggiornare il progetto.");
  }
  const project = (await response.json()) as ProjectDto;
  return { id: project.id, name: project.name, customerId: project.customerId };
}

export async function deleteProject(id: string): Promise<void> {
  const response = await authFetch(`${API_BASE_URL}/projects/${id}`, {
    method: "DELETE",
    headers: authHeader(),
  });
  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message ?? "Impossibile eliminare il progetto.");
  }
}

export async function createTask(
  projectId: string,
  title: string,
  description?: string,
  status?: TaskStatus,
  priority?: number,
  dueDate?: string | null,
  assigneeIds?: string[],
): Promise<Task> {
  const response = await authFetch(`${API_BASE_URL}/projects/${projectId}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify({ title, description, status, priority, dueDate, assigneeIds }),
  });
  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message ?? "Impossibile creare il task.");
  }
  const task = (await response.json()) as TaskDto;
  return toTask(task);
}

export async function updateTask(
  projectId: string,
  taskId: string,
  title: string,
  description: string,
  dueDate: string | null,
): Promise<Task> {
  const response = await authFetch(
    `${API_BASE_URL}/projects/${projectId}/tasks/${taskId}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({ title, description, dueDate }),
    },
  );
  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message ?? "Impossibile aggiornare il task.");
  }
  const task = (await response.json()) as TaskDto;
  return toTask(task);
}

export async function updateTaskStatus(
  projectId: string,
  taskId: string,
  status: TaskStatus,
): Promise<Task> {
  const response = await authFetch(
    `${API_BASE_URL}/projects/${projectId}/tasks/${taskId}/status`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({ status }),
    },
  );
  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message ?? "Impossibile aggiornare lo stato del task.");
  }
  const task = (await response.json()) as TaskDto;
  return toTask(task);
}

export async function updateTaskWorkTimer(
  projectId: string,
  taskId: string,
  action: WorkTimerAction,
): Promise<Task> {
  const response = await authFetch(
    `${API_BASE_URL}/projects/${projectId}/tasks/${taskId}/work-timer`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({ action }),
    },
  );
  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message ?? "Impossibile aggiornare il timer di lavorazione.");
  }
  const task = (await response.json()) as TaskDto;
  return toTask(task);
}

export async function updateTaskElapsedSeconds(
  projectId: string,
  taskId: string,
  workAccumulatedSeconds: number,
): Promise<Task> {
  const response = await authFetch(
    `${API_BASE_URL}/projects/${projectId}/tasks/${taskId}/work-timer/elapsed-seconds`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({ workAccumulatedSeconds }),
    },
  );
  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message ?? "Impossibile aggiornare il tempo di lavorazione.");
  }
  const task = (await response.json()) as TaskDto;
  return toTask(task);
}

interface TaskCommentDto {
  id: string;
  taskId: string;
  projectId: string;
  authorId: string;
  authorDisplayName: string;
  body: string;
  createdAt: string;
  edited: boolean;
}

// projectId è ridondante lato dominio frontend: il pannello commenti riceve
// già projectId/taskId come prop dal chiamante, coerente con come toTask
// scarta i campi del DTO non rilevanti per Task.
function toTaskComment(dto: TaskCommentDto): TaskComment {
  return {
    id: dto.id,
    taskId: dto.taskId,
    authorId: dto.authorId,
    authorDisplayName: dto.authorDisplayName,
    body: dto.body,
    createdAt: dto.createdAt,
    edited: dto.edited,
  };
}

export async function listTaskComments(projectId: string, taskId: string): Promise<TaskComment[]> {
  const response = await authFetch(
    `${API_BASE_URL}/projects/${projectId}/tasks/${taskId}/comments`,
    { headers: authHeader() },
  );
  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message ?? "Impossibile caricare i commenti del task.");
  }
  const comments = (await response.json()) as TaskCommentDto[];
  return comments.map(toTaskComment);
}

export async function createTaskComment(
  projectId: string,
  taskId: string,
  body: string,
): Promise<TaskComment> {
  const response = await authFetch(
    `${API_BASE_URL}/projects/${projectId}/tasks/${taskId}/comments`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({ body }),
    },
  );
  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message ?? "Impossibile inviare il commento.");
  }
  const comment = (await response.json()) as TaskCommentDto;
  return toTaskComment(comment);
}

export async function updateTaskComment(
  projectId: string,
  taskId: string,
  commentId: string,
  body: string,
): Promise<TaskComment> {
  const response = await authFetch(
    `${API_BASE_URL}/projects/${projectId}/tasks/${taskId}/comments/${commentId}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({ body }),
    },
  );
  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message ?? "Impossibile modificare il commento.");
  }
  const comment = (await response.json()) as TaskCommentDto;
  return toTaskComment(comment);
}

export async function deleteTaskComment(
  projectId: string,
  taskId: string,
  commentId: string,
): Promise<void> {
  const response = await authFetch(
    `${API_BASE_URL}/projects/${projectId}/tasks/${taskId}/comments/${commentId}`,
    {
      method: "DELETE",
      headers: authHeader(),
    },
  );
  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message ?? "Impossibile eliminare il commento.");
  }
}

export async function updateTaskPriority(
  projectId: string,
  taskId: string,
  priority: number,
): Promise<Task> {
  const response = await authFetch(
    `${API_BASE_URL}/projects/${projectId}/tasks/${taskId}/priority`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({ priority }),
    },
  );
  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message ?? "Impossibile aggiornare la priorità del task.");
  }
  const task = (await response.json()) as TaskDto;
  return toTask(task);
}

// Replace-all: sostituisce l'intero set di assegnatari del task con userIds
// (stesso pattern lato backend di setAssignedProjects/setProjectAssignments).
export async function updateTaskAssignees(
  projectId: string,
  taskId: string,
  userIds: string[],
): Promise<Task> {
  const response = await authFetch(
    `${API_BASE_URL}/projects/${projectId}/tasks/${taskId}/assignees`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({ userIds }),
    },
  );
  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message ?? "Impossibile aggiornare gli assegnatari del task.");
  }
  const task = (await response.json()) as TaskDto;
  return toTask(task);
}
