import { io, type Socket } from "socket.io-client";
import type { Task, TaskAssignee, TaskComment, TaskStatus } from "../../../shared/types/project";
import { API_BASE_URL } from "../httpClient";
import { getToken, getUser, updateStoredUser, type User } from "../auth/authService";

interface TaskEventDto {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: number;
  dueDate: string | null;
  assignees: TaskAssignee[];
}

interface ProjectEventDto {
  id: string;
  name: string;
  isActive: boolean;
}

export type NotificationType =
  | "task_comment"
  | "task_created"
  | "task_due"
  | "project_assigned"
  | "task_assigned";

export interface NotificationEventDto {
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

interface TaskCommentEventDto {
  id: string;
  taskId: string;
  projectId: string;
  authorId: string;
  authorUsername: string;
  body: string;
  createdAt: string;
  edited: boolean;
}

interface ServerToClientEvents {
  "task:created": (task: TaskEventDto) => void;
  "task:updated": (task: TaskEventDto) => void;
  "task:deleted": (payload: { projectId: string; taskId: string }) => void;
  "task:comment:created": (comment: TaskCommentEventDto) => void;
  "task:comment:updated": (comment: TaskCommentEventDto) => void;
  "task:comment:deleted": (payload: { projectId: string; taskId: string; commentId: string }) => void;
  "project:created": (project: ProjectEventDto) => void;
  "project:updated": (project: ProjectEventDto) => void;
  "project:deleted": (payload: { projectId: string }) => void;
  // Recapitato solo alla room personale dell'utente modificato (vedi io.ts
  // lato backend): mai un dato di un altro utente della company.
  "user:updated": (user: User) => void;
  // Stessa room personale di user:updated, non una room di progetto: una
  // notifica riguarda sempre uno specifico destinatario, mai l'intera company.
  "notification:created": (notification: NotificationEventDto) => void;
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
    // Funzione anziché oggetto: rivalutata a ogni (ri)connessione, così un
    // token rinnovato dopo login/logout raggiunge il server anche se il
    // socket condiviso è già stato aperto in precedenza.
    socket = io(API_BASE_URL, {
      auth: (cb) => cb({ token: getToken() }),
    });
  }
  return socket;
}

function toTask(dto: TaskEventDto): Task {
  return {
    id: dto.id,
    title: dto.title,
    description: dto.description ?? "",
    status: dto.status,
    priority: dto.priority,
    dueDate: dto.dueDate ?? null,
    assignees: dto.assignees,
  };
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

function toTaskComment(dto: TaskCommentEventDto): TaskComment {
  return {
    id: dto.id,
    taskId: dto.taskId,
    authorId: dto.authorId,
    authorUsername: dto.authorUsername,
    body: dto.body,
    createdAt: dto.createdAt,
    edited: dto.edited,
  };
}

export interface TaskCommentEventHandlers {
  onCreated: (comment: TaskComment) => void;
  onUpdated: (comment: TaskComment) => void;
  onDeleted: (commentId: string) => void;
}

// Nessun project:join/leave qui: la room del progetto è già joinata da
// subscribeToProjectTasks, montato dalla pagina che ospita la modale finché
// questo pannello commenti è visibile. Filtra per taskId (non solo
// projectId) perché la room recapita i commenti di TUTTI i task del progetto.
export function subscribeToTaskComments(
  taskId: string,
  handlers: TaskCommentEventHandlers,
): () => void {
  const client = getSocket();

  const handleCreated = (dto: TaskCommentEventDto) => {
    if (dto.taskId === taskId) handlers.onCreated(toTaskComment(dto));
  };
  const handleUpdated = (dto: TaskCommentEventDto) => {
    if (dto.taskId === taskId) handlers.onUpdated(toTaskComment(dto));
  };
  const handleDeleted = (payload: { projectId: string; taskId: string; commentId: string }) => {
    if (payload.taskId === taskId) handlers.onDeleted(payload.commentId);
  };

  client.on("task:comment:created", handleCreated);
  client.on("task:comment:updated", handleUpdated);
  client.on("task:comment:deleted", handleDeleted);

  return () => {
    client.off("task:comment:created", handleCreated);
    client.off("task:comment:updated", handleUpdated);
    client.off("task:comment:deleted", handleDeleted);
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

// Sottoscrizione singola e persistente (montata in ProtectedLayoutComponent,
// mai smontata durante la navigazione tra pagine protette): quando l'owner
// modifica questo stesso utente (es. promozione a project manager),
// aggiorna lo storage locale così ogni lettura reattiva (useAuthUser) si
// ri-renderizza subito, senza attendere una disconnessione/riconnessione o
// un nuovo login.
export function subscribeToOwnUserUpdates(): () => void {
  const client = getSocket();

  const handleUpdated = (user: User) => {
    // Guardia difensiva: la room 'user:<id>' lato server dovrebbe già
    // garantire che qui arrivi solo il proprio utente, ma se per qualche
    // motivo lo storage locale fosse vuoto (es. evento in transito durante un
    // logout) non scriviamo comunque uno user senza id da confrontare.
    if (getUser()?.id === user.id) {
      updateStoredUser(user);
    }
  };

  client.on("user:updated", handleUpdated);

  return () => {
    client.off("user:updated", handleUpdated);
  };
}

export interface NotificationEventHandlers {
  onCreated: (notification: NotificationEventDto) => void;
}

// Nessun project:join/leave: stessa room personale di subscribeToOwnUserUpdates
// sopra, il server recapita già solo le notifiche del destinatario.
export function subscribeToNotifications(handlers: NotificationEventHandlers): () => void {
  const client = getSocket();

  const handleCreated = (notification: NotificationEventDto) => handlers.onCreated(notification);

  client.on("notification:created", handleCreated);

  return () => {
    client.off("notification:created", handleCreated);
  };
}
