import type { Project, Task, TaskStatus } from "../../../shared/types/project";
import { authHeader } from "../auth/authService";
import { API_BASE_URL, readErrorMessage } from "../httpClient";

interface ProjectDto {
  id: string;
  name: string;
  isActive: boolean;
}

interface TaskDto {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: number;
}

function toTask(dto: TaskDto): Task {
  return {
    id: dto.id,
    title: dto.title,
    description: dto.description ?? "",
    status: dto.status,
    priority: dto.priority,
  };
}

async function fetchProjectTasks(projectId: string): Promise<Task[]> {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/tasks`, { headers: authHeader() });
  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message ?? "Impossibile caricare i task del progetto.");
  }
  const tasks = (await response.json()) as TaskDto[];
  return tasks.map(toTask);
}

export async function getAllProjects(): Promise<Project[]> {
  const response = await fetch(`${API_BASE_URL}/projects`, { headers: authHeader() });
  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message ?? "Impossibile caricare i progetti.");
  }
  const projects = (await response.json()) as ProjectDto[];

  return Promise.all(
    projects.map(async (project) => ({
      id: project.id,
      name: project.name,
      tasks: await fetchProjectTasks(project.id),
    })),
  );
}

// Solo il nome, senza i task: usata dove serve un'etichetta leggibile (es. il
// toggle "contesto" dell'assistente) senza pagare la fetchProjectTasks di
// getProjectById.
export async function getProjectName(id: string): Promise<string | undefined> {
  const response = await fetch(`${API_BASE_URL}/projects/${id}`, { headers: authHeader() });
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
  const response = await fetch(`${API_BASE_URL}/projects/${id}`, { headers: authHeader() });
  if (response.status === 404) {
    return undefined;
  }
  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message ?? "Impossibile caricare il progetto.");
  }
  const project = (await response.json()) as ProjectDto;
  const tasks = await fetchProjectTasks(id);
  return { id: project.id, name: project.name, tasks };
}

export async function createProject(name: string): Promise<Project> {
  const response = await fetch(`${API_BASE_URL}/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message ?? "Impossibile creare il progetto.");
  }
  const project = (await response.json()) as ProjectDto;
  return { id: project.id, name: project.name, tasks: [] };
}

export async function updateProject(
  id: string,
  name: string,
): Promise<Pick<Project, "id" | "name">> {
  const response = await fetch(`${API_BASE_URL}/projects/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message ?? "Impossibile aggiornare il progetto.");
  }
  const project = (await response.json()) as ProjectDto;
  return { id: project.id, name: project.name };
}

export async function deleteProject(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/projects/${id}`, {
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
): Promise<Task> {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, description }),
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
): Promise<Task> {
  const response = await fetch(
    `${API_BASE_URL}/projects/${projectId}/tasks/${taskId}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description }),
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
  const response = await fetch(
    `${API_BASE_URL}/projects/${projectId}/tasks/${taskId}/status`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
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

export async function updateTaskPriority(
  projectId: string,
  taskId: string,
  priority: number,
): Promise<Task> {
  const response = await fetch(
    `${API_BASE_URL}/projects/${projectId}/tasks/${taskId}/priority`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
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
