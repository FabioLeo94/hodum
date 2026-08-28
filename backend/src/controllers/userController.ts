import { Body, Controller, Delete, Get, Path, Post, Put, Response, Route, SuccessResponse } from 'tsoa';
import type { User } from '../models/user';
import {
  createUser,
  deleteUser,
  getUserById,
  listUsers,
  UserConflictError,
  UserNotFoundError,
  updateUser,
} from '../services/userService';

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

export interface CreateUserRequest {
  username: string;
  email: string;
  password: string;
}

export interface UpdateUserRequest {
  username?: string;
  email?: string;
  password?: string;
}

// Forma minima "contiene una @" per l'email: non è una validazione RFC
// completa, solo lo scarto dei casi palesemente sbagliati prima di arrivare
// al vincolo UNIQUE del DB.
function isValidEmail(email: string): boolean {
  return email.includes('@');
}

// Il path va scritto come stringa letterale: tsoa lo legge dall'AST prima
// dell'avvio, una costante importata non verrebbe risolta in generazione.
@Route('users')
export class UserController extends Controller {
  @Get()
  public async listUsers(): Promise<User[]> {
    return listUsers();
  }

  @Get('{id}')
  @Response<UserErrorResponse>(404, 'User non trovato')
  public async getUser(@Path() id: string): Promise<User | UserErrorResponse> {
    try {
      return await getUserById(id);
    } catch (err) {
      if (err instanceof UserNotFoundError) {
        this.setStatus(404);
        return { message: err.message };
      }
      throw err;
    }
  }

  @Post()
  @SuccessResponse(201, 'User creato')
  @Response<UserErrorResponse>(422, 'username, email o password non validi')
  @Response<UserErrorResponse>(409, 'username o email già in uso')
  public async createUser(@Body() body: CreateUserRequest): Promise<User | UserErrorResponse> {
    // tsoa valida che i campi siano stringhe (non opzionali), ma non che non
    // siano vuote o abbiano una forma minima: regole di dominio, non di
    // forma, quindi restano responsabilità del controller.
    if (body.username.trim().length === 0) {
      this.setStatus(422);
      return { message: 'username non può essere vuoto' };
    }
    if (!isValidEmail(body.email)) {
      this.setStatus(422);
      return { message: 'email non valida' };
    }
    if (body.password.trim().length === 0) {
      this.setStatus(422);
      return { message: 'password non può essere vuota' };
    }

    try {
      const user = await createUser({ username: body.username, email: body.email, password: body.password });
      this.setStatus(201);
      return user;
    } catch (err) {
      if (err instanceof UserConflictError) {
        this.setStatus(409);
        return { message: err.message };
      }
      throw err;
    }
  }

  @Put('{id}')
  @Response<UserErrorResponse>(404, 'User non trovato')
  @Response<UserErrorResponse>(422, 'username, email o password presenti ma non validi')
  @Response<UserErrorResponse>(409, 'username o email già in uso')
  public async updateUser(@Path() id: string, @Body() body: UpdateUserRequest): Promise<User | UserErrorResponse> {
    if (body.username !== undefined && body.username.trim().length === 0) {
      this.setStatus(422);
      return { message: 'username non può essere vuoto' };
    }
    if (body.email !== undefined && !isValidEmail(body.email)) {
      this.setStatus(422);
      return { message: 'email non valida' };
    }
    if (body.password !== undefined && body.password.trim().length === 0) {
      this.setStatus(422);
      return { message: 'password non può essere vuota' };
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

  @Delete('{id}')
  @SuccessResponse(204, 'User eliminato')
  @Response<UserErrorResponse>(404, 'User non trovato')
  public async deleteUser(@Path() id: string): Promise<void> {
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
