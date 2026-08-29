// Bus di eventi realtime verso il frontend: i service (taskService,
// projectService) chiamano gli emit* qui sotto subito dopo ogni scrittura
// riuscita, indipendentemente da chi ha originato la richiesta (controller
// REST o assistantService.callTool). Un solo punto di emissione copre
// entrambi i chiamanti senza duplicare la notifica in ciascuno di essi.
import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { Project } from '../models/project';
import type { Task } from '../models/task';

interface ServerToClientEvents {
  'task:created': (task: Task) => void;
  'task:updated': (task: Task) => void;
  'task:deleted': (payload: { projectId: string; taskId: string }) => void;
  'project:created': (project: Project) => void;
  'project:updated': (project: Project) => void;
  'project:deleted': (payload: { projectId: string }) => void;
}

interface ClientToServerEvents {
  'project:join': (projectId: string) => void;
  'project:leave': (projectId: string) => void;
}

type RealtimeServer = Server<ClientToServerEvents, ServerToClientEvents>;

let io: RealtimeServer | undefined;

function projectRoom(projectId: string): string {
  return `project:${projectId}`;
}

// Va chiamata una sola volta all'avvio (vedi server.ts), sopra lo stesso
// http.Server già usato da Express: nessuna porta separata da configurare, il
// client si connette allo stesso host:port dell'API REST.
export function initRealtime(httpServer: HttpServer): RealtimeServer {
  io = new Server(httpServer, {
    cors: { origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173' },
  });

  io.on('connection', (socket) => {
    // Le room sono per progetto: un client entra solo in quelle dei progetti
    // che sta effettivamente guardando (vedi TaskListContent nel frontend),
    // così un evento task:* raggiunge solo chi ne ha bisogno invece di essere
    // trasmesso a ogni client connesso.
    socket.on('project:join', (projectId) => {
      socket.join(projectRoom(projectId));
    });
    socket.on('project:leave', (projectId) => {
      socket.leave(projectRoom(projectId));
    });
  });

  return io;
}

// undefined solo se un service viene esercitato senza essere passato da
// server.ts (es. un futuro test che chiama i service direttamente): nessun
// server HTTP attivo significa nessun client da notificare, quindi gli emit*
// sotto diventano no-op silenziosi invece di lanciare.
function getIo(): RealtimeServer | undefined {
  return io;
}

export function emitTaskCreated(task: Task): void {
  getIo()?.to(projectRoom(task.projectId)).emit('task:created', task);
}

export function emitTaskUpdated(task: Task): void {
  getIo()?.to(projectRoom(task.projectId)).emit('task:updated', task);
}

export function emitTaskDeleted(projectId: string, taskId: string): void {
  getIo()?.to(projectRoom(projectId)).emit('task:deleted', { projectId, taskId });
}

// I progetti sono pochi e le loro mutazioni infrequenti: un broadcast a tutti
// i connessi (invece di una room dedicata) resta trascurabile e evita la
// complessità di una room "dashboard" a cui iscriversi separatamente.
export function emitProjectCreated(project: Project): void {
  getIo()?.emit('project:created', project);
}

export function emitProjectUpdated(project: Project): void {
  getIo()?.emit('project:updated', project);
}

export function emitProjectDeleted(projectId: string): void {
  getIo()?.emit('project:deleted', { projectId });
}
