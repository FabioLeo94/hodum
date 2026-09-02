import type { Request as ExRequest } from 'express';
import { Body, Controller, Delete, Get, Path, Put, Request, Response, Route, Security, SuccessResponse } from 'tsoa';
import { getAuthenticatedUser } from '../middleware/authentication';
import type { Project } from '../models/project';
import type { User } from '../models/user';
import {
  changePassword,
  deleteUser,
  getUserById,
  listUsers,
  UserConflictError,
  UserNotFoundError,
  updateUser,
} from '../services/userService';
import {
  EmployeeNotFoundError,
  listAssignedProjects,
  setProjectAssignments,
} from '../services/projectAssignmentService';
import { ProjectNotFoundError } from '../services/projectService';
import { isValidEmail, isValidPassword, PASSWORD_POLICY_MESSAGE } from '../utils/validation';

// Corpo di risposta per gli esiti di errore documentati via @Response: stessa
// forma { message } già usata dall'error handler globale in app.ts, per
// coerenza su tutta l'API.
// Nome distinto da quello omonimo in projectController.ts: tsoa risolve i
// modelli per nome dell'interfaccia a livello globale (non per file), quindi
// due "ErrorResponse" locali a controller diversi collidono in generazione
// ("Found 2 different model definitions for model ErrorResponse").
interface UserErrorResponse {
  message: string;
}

export interface UpdateUserRequest {
  username?: string;
  email?: string;
  password?: string;
  // Applicato solo quando l'owner modifica un proprio dipendente (mai nel
  // self-service: un utente non può cambiare il proprio ruolo), per
  // promuoverlo a project manager o retrocederlo a dipendente. 'owner' non è
  // un valore accettato: non è raggiungibile per via applicativa da questo
  // endpoint (vedi isOwnerEditingEmployee sotto).
  role?: 'employee' | 'manager';
}

export interface ChangePasswordRequest {
  password: string;
}

// Task "Gestione del dipendente": l'owner invia l'intero set di progetti che
// il dipendente deve avere assegnati (replace-all), non un delta — più
// semplice da esprimere lato UI (una checklist) che una coppia di endpoint
// assign/unassign.
export interface AssignProjectsRequest {
  projectIds: string[];
}

// Un id che non combacia con l'utente autenticato (né come "sé stesso" né come
// collega della stessa azienda) risponde 404, non 403: stesso principio già
// applicato ai progetti in projectService.ts, non conferma con un 403
// l'esistenza di un utente fuori dal proprio ambito.
function notFoundResponse(id: string): UserErrorResponse {
  return { message: `User con id ${id} non trovato` };
}

// Il path va scritto come stringa letterale: tsoa lo legge dall'AST prima
// dell'avvio, una costante importata non verrebbe risolta in generazione.
@Route('users')
export class UserController extends Controller {
  @Get()
  @Security('jwt')
  public async listUsers(@Request() request: ExRequest): Promise<User[]> {
    const requester = getAuthenticatedUser(request);
    return listUsers(requester.companyId);
  }

  @Get('{id}')
  @Security('jwt')
  @Response<UserErrorResponse>(404, 'User non trovato')
  public async getUser(@Path() id: string, @Request() request: ExRequest): Promise<User | UserErrorResponse> {
    const requester = getAuthenticatedUser(request);
    try {
      const user = await getUserById(id);
      // Visibile solo se è l'utente stesso o un collega della stessa azienda
      // (entrambi companyId non nulli e uguali): senza questo controllo,
      // getUserById espone qualunque utente di qualunque azienda a chi conosce
      // l'id.
      const isSelf = user.id === requester.id;
      const isSameCompany =
        requester.companyId !== null && user.companyId !== null && user.companyId === requester.companyId;
      if (!isSelf && !isSameCompany) {
        this.setStatus(404);
        return notFoundResponse(id);
      }
      return user;
    } catch (err) {
      if (err instanceof UserNotFoundError) {
        this.setStatus(404);
        return { message: err.message };
      }
      throw err;
    }
  }

  // Self-service (id === requester.id) oppure owner che modifica un proprio
  // dipendente (task "Gestione del dipendente"): un id che non combacia con
  // nessuno dei due casi risponde 404, stesso principio di getUser sopra (un
  // utente fuori dal proprio ambito non va confermato con un 403).
  @Put('{id}')
  @Security('jwt')
  @Response<UserErrorResponse>(404, 'User non trovato')
  @Response<UserErrorResponse>(422, 'username, email o password presenti ma non validi')
  @Response<UserErrorResponse>(409, 'username o email già in uso')
  public async updateUser(
    @Path() id: string,
    @Body() body: UpdateUserRequest,
    @Request() request: ExRequest,
  ): Promise<User | UserErrorResponse> {
    const requester = getAuthenticatedUser(request);
    let isOwnerEditingEmployee = false;
    if (id !== requester.id) {
      if (requester.role !== 'owner') {
        this.setStatus(404);
        return notFoundResponse(id);
      }
      let target: User;
      try {
        target = await getUserById(id);
      } catch (err) {
        if (err instanceof UserNotFoundError) {
          this.setStatus(404);
          return notFoundResponse(id);
        }
        throw err;
      }
      if (
        (target.role !== 'employee' && target.role !== 'manager') ||
        target.companyId !== requester.companyId
      ) {
        this.setStatus(404);
        return notFoundResponse(id);
      }
      isOwnerEditingEmployee = true;
    }

    if (body.username !== undefined && body.username.trim().length === 0) {
      this.setStatus(422);
      return { message: 'username non può essere vuoto' };
    }
    if (body.email !== undefined && !isValidEmail(body.email)) {
      this.setStatus(422);
      return { message: 'email non valida' };
    }
    if (body.password !== undefined && !isValidPassword(body.password)) {
      this.setStatus(422);
      return { message: PASSWORD_POLICY_MESSAGE };
    }

    try {
      // Un reset password fatto dall'owner rimette must_change_password a
      // true, stesso comportamento della creazione dipendente (createEmployee
      // in companyService.ts): il dipendente deve sceglierne una propria al
      // prossimo accesso, l'owner non deve comunicargliene una valida per sempre.
      // Condizionato anche a body.password !== undefined: se l'owner modifica
      // altri campi (username, email, ruolo) senza toccare la password, questa
      // non è stata compromessa e non va richiesto un cambio al dipendente.
      return await updateUser(id, {
        ...body,
        // Scartato nel self-service (isOwnerEditingEmployee false) anche se
        // presente nel body: un utente non deve poter promuovere sé stesso
        // cambiando il proprio ruolo.
        role: isOwnerEditingEmployee ? body.role : undefined,
        forceChangePassword: isOwnerEditingEmployee && body.password !== undefined,
      });
    } catch (err) {
      if (err instanceof UserNotFoundError) {
        this.setStatus(404);
        return { message: err.message };
      }
      if (err instanceof UserConflictError) {
        this.setStatus(409);
        return { message: err.message };
      }
      throw err;
    }
  }

  // Rotta dedicata (task "cambio password obbligatorio al primo accesso"),
  // distinta da PUT /users/{id} sopra: @Security('password-change') invece di
  // 'jwt' è ciò che la rende raggiungibile anche quando mustChangePassword è
  // true, mentre updateUser resta bloccato in quel caso (vedi
  // expressAuthentication in middleware/authentication.ts). Stessa
  // restrizione self-service (id !== requester.id -> 404).
  @Put('{id}/password')
  @Security('password-change')
  @Response<UserErrorResponse>(404, 'User non trovato')
  @Response<UserErrorResponse>(422, 'password non valida')
  public async changePassword(
    @Path() id: string,
    @Body() body: ChangePasswordRequest,
    @Request() request: ExRequest,
  ): Promise<User | UserErrorResponse> {
    const requester = getAuthenticatedUser(request);
    if (id !== requester.id) {
      this.setStatus(404);
      return notFoundResponse(id);
    }

    if (!isValidPassword(body.password)) {
      this.setStatus(422);
      return { message: PASSWORD_POLICY_MESSAGE };
    }

    try {
      return await changePassword(id, body.password);
    } catch (err) {
      if (err instanceof UserNotFoundError) {
        this.setStatus(404);
        return notFoundResponse(id);
      }
      throw err;
    }
  }

  // @Security('owner') basta per il ruolo, ma non per lo scope: senza
  // requester.companyId un owner "orfano" (stato transitorio impossibile in
  // pratica, ma non escluso dal tipo) non ha dipendenti da elencare —
  // EmployeeNotFoundError normalizza entrambi i casi allo stesso 404.
  @Get('{id}/projects')
  @Security('manager')
  @Response<UserErrorResponse>(404, 'Dipendente non trovato')
  public async listEmployeeProjects(
    @Path() id: string,
    @Request() request: ExRequest,
  ): Promise<Project[] | UserErrorResponse> {
    const requester = getAuthenticatedUser(request);
    if (!requester.companyId) {
      this.setStatus(404);
      return notFoundResponse(id);
    }
    try {
      return await listAssignedProjects(id, requester.companyId);
    } catch (err) {
      if (err instanceof EmployeeNotFoundError) {
        this.setStatus(404);
        return { message: err.message };
      }
      throw err;
    }
  }

  @Put('{id}/projects')
  @Security('manager')
  @Response<UserErrorResponse>(404, 'Dipendente o progetto non trovato')
  public async assignEmployeeProjects(
    @Path() id: string,
    @Body() body: AssignProjectsRequest,
    @Request() request: ExRequest,
  ): Promise<Project[] | UserErrorResponse> {
    const requester = getAuthenticatedUser(request);
    if (!requester.companyId) {
      this.setStatus(404);
      return notFoundResponse(id);
    }
    try {
      await setProjectAssignments(id, body.projectIds, requester.companyId, requester.id);
      return await listAssignedProjects(id, requester.companyId);
    } catch (err) {
      if (err instanceof EmployeeNotFoundError) {
        this.setStatus(404);
        return { message: err.message };
      }
      if (err instanceof ProjectNotFoundError) {
        this.setStatus(404);
        return { message: err.message };
      }
      throw err;
    }
  }

  // Self-service (id === requester.id) oppure owner che elimina un proprio
  // dipendente (task "Gestione del dipendente"), stessa restrizione di
  // updateUser sopra: un id fuori da questi due casi risponde 404, mai 403,
  // per non confermare l'esistenza di un utente fuori dal proprio ambito.
  // project_assignments_users_fk (ON DELETE CASCADE, migrations/0010) ripulisce
  // da sé le assegnazioni progetto del dipendente eliminato.
  @Delete('{id}')
  @Security('jwt')
  @SuccessResponse(204, 'User eliminato')
  @Response<UserErrorResponse>(404, 'User non trovato')
  public async deleteUser(@Path() id: string, @Request() request: ExRequest): Promise<void> {
    const requester = getAuthenticatedUser(request);
    if (id !== requester.id) {
      if (requester.role !== 'owner') {
        this.setStatus(404);
        return;
      }
      let target: User;
      try {
        target = await getUserById(id);
      } catch (err) {
        if (err instanceof UserNotFoundError) {
          this.setStatus(404);
          return;
        }
        throw err;
      }
      if (
        (target.role !== 'employee' && target.role !== 'manager') ||
        target.companyId !== requester.companyId
      ) {
        this.setStatus(404);
        return;
      }
    }

    try {
      await deleteUser(id);
      this.setStatus(204);
    } catch (err) {
      if (err instanceof UserNotFoundError) {
        this.setStatus(404);
        return;
      }
      throw err;
    }
  }
}
