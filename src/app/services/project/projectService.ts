import type { Project, Task, TaskStatus } from "../../../shared/types/project";
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
}

function toTask(dto: TaskDto): Task {
  return {
    id: dto.id,
    title: dto.title,
    description: dto.description ?? "",
    status: dto.status,
  };
}

async function fetchProjectTasks(projectId: string): Promise<Task[]> {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/tasks`);
  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message ?? "Impossibile caricare i task del progetto.");
  }
  const tasks = (await response.json()) as TaskDto[];
  return tasks.map(toTask);
}

export async function getAllProjects(): Promise<Project[]> {
  const response = await fetch(`${API_BASE_URL}/projects`);
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

export async function getProjectById(id: string): Promise<Project | undefined> {
  const response = await fetch(`${API_BASE_URL}/projects/${id}`);
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
    headers: { "Content-Type": "application/json" },
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
    headers: { "Content-Type": "application/json" },
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
