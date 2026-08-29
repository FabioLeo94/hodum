import { io, type Socket } from "socket.io-client";
import type { Task, TaskStatus } from "../../../shared/types/project";
import { API_BASE_URL } from "../httpClient";

interface TaskEventDto {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
}

interface ProjectEventDto {
  id: string;
  name: string;
  isActive: boolean;
}

interface ServerToClientEvents {
  "task:created": (task: TaskEventDto) => void;
  "task:updated": (task: TaskEventDto) => void;
  "task:deleted": (payload: { projectId: string; taskId: string }) => void;
  "project:created": (project: ProjectEventDto) => void;
  "project:updated": (project: ProjectEventDto) => void;
  "project:deleted": (payload: { projectId: string }) => void;
}

interface ClientToServerEvents {
  "project:join": (projectId: string) => void;
  "project:leave": (projectId: string) => void;
}

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | undefined;

// Connessione unica e condivisa per l'intera app: aperta lazy alla prima
// subscribe (non ad ogni pagina), stesso host:porta dell'API REST.
function getSocket(): Socket<ServerToClientEvents, ClientToServerEvents> {
  if (!socket) {
    socket = io(API_BASE_URL);
  }
  return socket;
}

function toTask(dto: TaskEventDto): Task {
  return { id: dto.id, title: dto.title, description: dto.description ?? "", status: dto.status };
}

export interface TaskEventHandlers {
  onTaskCreated: (task: Task) => void;
  onTaskUpdated: (task: Task) => void;
  onTaskDeleted: (taskId: string) => void;
  // Invocato quando il socket si RIconnette dopo una disconnessione (non alla
  // prima connessione, già coperta dal fetch iniziale della pagina): la room
  // può aver perso eventi nel frattempo, quindi il chiamante deve
  // risincronizzare lo stato con un refetch.
  onResync?: () => void;
}

// Un client entra nella room del progetto solo mentre lo sta guardando: un
// evento task:* raggiunge quindi solo chi ne ha bisogno, non ogni client
// connesso. Ritorna la funzione di cleanup da chiamare allo smontaggio.
export function subscribeToProjectTasks(projectId: string, handlers: TaskEventHandlers): () => void {
  const client = getSocket();
  let hasConnectedOnce = client.connected;

  const handleCreated = (dto: TaskEventDto) => {
    if (dto.projectId === projectId) handlers.onTaskCreated(toTask(dto));
  };
  const handleUpdated = (dto: TaskEventDto) => {
    if (dto.projectId === projectId) handlers.onTaskUpdated(toTask(dto));
  };
  const handleDeleted = (payload: { projectId: string; taskId: string }) => {
    if (payload.projectId === projectId) handlers.onTaskDeleted(payload.taskId);
  };
  const handleConnect = () => {
    if (hasConnectedOnce) {
      handlers.onResync?.();
    }
    hasConnectedOnce = true;
    client.emit("project:join", projectId);
  };

  client.on("task:created", handleCreated);
  client.on("task:updated", handleUpdated);
  client.on("task:deleted", handleDeleted);
  client.on("connect", handleConnect);

  if (client.connected) {
    client.emit("project:join", projectId);
  }

  return () => {
    client.off("task:created", handleCreated);
    client.off("task:updated", handleUpdated);
    client.off("task:deleted", handleDeleted);
    client.off("connect", handleConnect);
    client.emit("project:leave", projectId);
  };
}

export interface ProjectEventHandlers {
  onProjectCreated: (project: ProjectEventDto) => void;
  onProjectUpdated: (project: ProjectEventDto) => void;
  onProjectDeleted: (projectId: string) => void;
}

// I progetti sono pochi e le loro mutazioni infrequenti: nessuna room
// dedicata, il broadcast dal server raggiunge direttamente tutti i connessi.
export function subscribeToProjects(handlers: ProjectEventHandlers): () => void {
  const client = getSocket();

  const handleCreated = (dto: ProjectEventDto) => handlers.onProjectCreated(dto);
  const handleUpdated = (dto: ProjectEventDto) => handlers.onProjectUpdated(dto);
  const handleDeleted = (payload: { projectId: string }) => handlers.onProjectDeleted(payload.projectId);

  client.on("project:created", handleCreated);
  client.on("project:updated", handleUpdated);
  client.on("project:deleted", handleDeleted);

  return () => {
    client.off("project:created", handleCreated);
    client.off("project:updated", handleUpdated);
    client.off("project:deleted", handleDeleted);
  };
}
