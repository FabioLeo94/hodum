import type { Request as ExRequest } from 'express';
import { Body, Controller, Delete, Get, Path, Put, Request, Response, Route, Security, SuccessResponse } from 'tsoa';
import { getAuthenticatedUser } from '../middleware/authentication';
import type { User } from '../models/user';
import { deleteUser, getUserById, listUsers, UserConflictError, UserNotFoundError, updateUser } from '../services/userService';
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

  // Solo self-service per ora: nessuna funzione "owner modifica un dipendente"
  // esiste ancora nel prodotto, quindi l'unico ambito legittimo è l'utente che
  // modifica sé stesso. Quando quella funzione arriverà, andrà qui aggiunto un
  // controllo esplicito sul ruolo (vedi models/user.ts), non riaperto a
  // chiunque per comodità.
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
    if (id !== requester.id) {
      this.setStatus(404);
      return notFoundResponse(id);
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
      return await updateUser(id, body);
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

  // Stessa restrizione self-service di updateUser: nessuna funzione "owner
  // elimina un dipendente" esiste ancora, quindi solo l'eliminazione del
  // proprio account è legittima oggi.
  @Delete('{id}')
  @Security('jwt')
  @SuccessResponse(204, 'User eliminato')
  @Response<UserErrorResponse>(404, 'User non trovato')
  public async deleteUser(@Path() id: string, @Request() request: ExRequest): Promise<void> {
    const requester = getAuthenticatedUser(request);
    if (id !== requester.id) {
      this.setStatus(404);
      return;
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
