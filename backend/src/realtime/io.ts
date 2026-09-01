// Bus di eventi realtime verso il frontend: i service (taskService,
// projectService) chiamano gli emit* qui sotto subito dopo ogni scrittura
// riuscita, indipendentemente da chi ha originato la richiesta (controller
// REST o assistantService.callTool). Un solo punto di emissione copre
// entrambi i chiamanti senza duplicare la notifica in ciascuno di essi.
import type { Server as HttpServer } from 'node:http';
import { DefaultEventsMap, Server, type Socket } from 'socket.io';
import type { Project } from '../models/project';
import type { Task } from '../models/task';
import { getProjectById, ProjectNotFoundError } from '../services/projectService';
import { getUserById, UserNotFoundError } from '../services/userService';
import { verifySessionToken } from '../services/tokenService';

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

// Valorizzato dalla middleware di autenticazione in initRealtime, prima che
// 'connection' scatti: ogni handler sotto legge companyId da qui invece di
// doverlo ridomandare al client (che potrebbe mentire).
interface SocketData {
  companyId: string | null;
}

type RealtimeServer = Server<ClientToServerEvents, ServerToClientEvents, DefaultEventsMap, SocketData>;
type RealtimeSocket = Socket<ClientToServerEvents, ServerToClientEvents, DefaultEventsMap, SocketData>;

let io: RealtimeServer | undefined;

function projectRoom(projectId: string): string {
  return `project:${projectId}`;
}

// Un solo canale per company: i broadcast "globali" (project:created/updated/
// deleted, vedi sotto) devono raggiungere solo i client della company a cui
// il progetto appartiene, non ogni client connesso al server — altrimenti un
// utente della company A vedrebbe nome/stato dei progetti della company B
// semplicemente stando connesso.
function companyRoom(companyId: string): string {
  return `company:${companyId}`;
}

// Risolve l'identità dal token JWT passato in handshake.auth.token (stesso
// token di sessione usato per le richieste REST, vedi expressAuthentication
// in middleware/authentication.ts). A differenza di quella funzione non
// applica controlli di ruolo (qui non esistono rotte "owner-only"): basta
// sapere a quale company appartiene il socket per scopare correttamente le
// room. Un socket senza token valido non emette mai 'connection': la
// connessione viene rifiutata dalla middleware sotto.
async function resolveCompanyId(socket: Socket): Promise<string | null> {
  const token = socket.handshake.auth?.token;
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error('Token di sessione mancante');
  }

  const { sub } = verifySessionToken(token);

  try {
    const user = await getUserById(sub);
    return user.companyId;
  } catch (err) {
    if (err instanceof UserNotFoundError) {
      // Stesso trattamento di expressAuthentication: non propaghiamo il
      // messaggio con l'id utente (dettaglio interno), un messaggio generico
      // basta al client per capire che la sessione non è più valida.
      throw new Error('Utente della sessione non trovato', { cause: err });
    }
    throw err;
  }
}

// project:join deve verificare che il progetto richiesto appartenga alla
// company del socket PRIMA di farlo entrare nella room: senza questo
// controllo, conoscere l'id (uuid) di un progetto di un'altra company basta
// a ricevere in tempo reale i suoi task (titoli, stati, priorità) — lo stesso
// IDOR cross-tenant già chiuso lato REST in projectService.ts/taskService.ts,
// qui riaperto se non replicato.
async function joinProjectRoom(socket: RealtimeSocket, projectId: string): Promise<void> {
  try {
    // getProjectById lancia ProjectNotFoundError sia per un id inesistente sia
    // per un progetto di un'altra company (companyId passato qui): i due casi
    // sono indistinguibili di proposito, stesso principio già applicato lato
    // REST.
    await getProjectById(projectId, socket.data.companyId);
    socket.join(projectRoom(projectId));
  } catch (err) {
    // Nessun canale di risposta su cui segnalare l'errore al client per
    // questo evento fire-and-forget: ProjectNotFoundError viene ignorato in
    // silenzio (il client semplicemente non riceverà eventi per quella room).
    // Qualunque altro errore (es. il pool DB momentaneamente irraggiungibile)
    // viene loggato e NON rilanciato: questo handler gira fuori dal ciclo di
    // una richiesta HTTP, un throw qui diventerebbe una promise rejection non
    // gestita e abbatterebbe il processo (vedi Node "unhandledRejection").
    if (!(err instanceof ProjectNotFoundError)) {
      console.error('Errore durante project:join', err);
    }
  }
}

// Va chiamata una sola volta all'avvio (vedi server.ts), sopra lo stesso
// http.Server già usato da Express: nessuna porta separata da configurare, il
// client si connette allo stesso host:port dell'API REST.
export function initRealtime(httpServer: HttpServer): RealtimeServer {
  io = new Server(httpServer, {
    cors: { origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173' },
  });

  // Middleware di handshake: prima di questa correzione qualunque client
  // poteva connettersi senza alcun token, entrare nella room di un progetto
  // di QUALSIASI company conoscendone l'id, e ricevere task:*/project:* di
  // dati altrui. next(err) rifiuta la connessione (il client riceve
  // 'connect_error'), mai un throw: una rejection non gestita qui
  // abbatterebbe il processo, esattamente come nei singoli handler sotto.
  io.use((socket, next) => {
    resolveCompanyId(socket)
      .then((companyId) => {
        socket.data.companyId = companyId;
        next();
      })
      .catch((err: unknown) => {
        next(err instanceof Error ? err : new Error('Autenticazione socket fallita'));
      });
  });

  io.on('connection', (socket) => {
    // Company room: qui viaggiano i broadcast project:created/updated/deleted
    // (vedi emitProject* sotto). Nessuna room se companyId è null (utente non
    // ancora agganciato a un'azienda, stato transitorio): non ha comunque
    // nessun progetto da vedere.
    if (socket.data.companyId) {
      socket.join(companyRoom(socket.data.companyId));
    }

    // Le room sono per progetto: un client entra solo in quelle dei progetti
    // che sta effettivamente guardando (vedi TaskListContent nel frontend),
    // così un evento task:* raggiunge solo chi ne ha bisogno invece di essere
    // trasmesso a ogni client connesso.
    socket.on('project:join', (projectId) => {
      void joinProjectRoom(socket, projectId);
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

// companyId obbligatorio (a differenza della versione precedente, che faceva
// broadcast a ogni client connesso): senza scoping per company, un utente
// della company A vedrebbe nome/stato dei progetti della company B in tempo
// reale semplicemente stando connesso, senza nemmeno dover unirsi a una room.
export function emitProjectCreated(project: Project, companyId: string): void {
  getIo()?.to(companyRoom(companyId)).emit('project:created', project);
}

export function emitProjectUpdated(project: Project, companyId: string): void {
  getIo()?.to(companyRoom(companyId)).emit('project:updated', project);
}

export function emitProjectDeleted(projectId: string, companyId: string): void {
  getIo()?.to(companyRoom(companyId)).emit('project:deleted', { projectId });
}
