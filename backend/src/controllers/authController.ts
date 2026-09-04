import type { Request as ExRequest } from 'express';
import { Body, Controller, Get, Post, Request, Response, Route, Security } from 'tsoa';
import { getAuthenticatedUser } from '../middleware/authentication';
import type { User } from '../models/user';
import { InvalidCredentialsError, InvalidRecoveryCodeError, login, recoverPassword } from '../services/authService';
import { signSessionToken } from '../services/tokenService';
import { isValidPassword, PASSWORD_POLICY_MESSAGE } from '../utils/validation';

// Nome distinto dagli omonimi "ErrorResponse" di project/userController.ts:
// tsoa risolve i modelli per nome dell'interfaccia a livello globale (non per
// file), quindi collidono in generazione se condivisi.
interface AuthErrorResponse {
  message: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: User;
  token: string;
}

export interface RecoverPasswordRequest {
  email: string;
  recoveryCode: string;
  newPassword: string;
}

export interface RecoverPasswordResponse {
  user: User;
  token: string;
  // Nuovo codice, sostituisce quello appena consumato (vedi
  // authService.recoverPassword): il frontend deve mostrarlo con lo stesso
  // avviso "salvalo, non verrà mostrato di nuovo" usato in registrazione.
  recoveryCode: string;
}

// Il path va scritto come stringa letterale: tsoa lo legge dall'AST prima
// dell'avvio, una costante importata non verrebbe risolta in generazione.
@Route('auth')
export class AuthController extends Controller {
  @Post('login')
  @Response<AuthErrorResponse>(401, 'Email o password non corretti')
  public async login(@Body() body: LoginRequest): Promise<LoginResponse | AuthErrorResponse> {
    try {
      const user = await login(body.email, body.password);
      const token = signSessionToken(user.id);
      return { user, token };
    } catch (err) {
      if (err instanceof InvalidCredentialsError) {
        this.setStatus(401);
        return { message: err.message };
      }
      throw err;
    }
  }

  // Endpoint pubblico deliberatamente, come POST /companies: è l'unico modo
  // di recuperare l'accesso senza avere già una sessione, per un owner che ha
  // perso la password (nessuno sopra di lui può resettarla, a differenza di
  // un dipendente/manager via PUT /users/{id}). Rate-limitato come /auth/login
  // (vedi app.ts) per lo stesso motivo: niente si oppone altrimenti a un
  // brute-force sul recovery code.
  @Post('recover-password')
  @Response<AuthErrorResponse>(401, 'Email o codice di recupero non validi')
  @Response<AuthErrorResponse>(422, 'newPassword non valida')
  public async recoverPassword(
    @Body() body: RecoverPasswordRequest,
  ): Promise<RecoverPasswordResponse | AuthErrorResponse> {
    if (!isValidPassword(body.newPassword)) {
      this.setStatus(422);
      return { message: PASSWORD_POLICY_MESSAGE };
    }

    try {
      const { user, recoveryCode } = await recoverPassword(body.email, body.recoveryCode, body.newPassword);
      const token = signSessionToken(user.id);
      return { user, token, recoveryCode };
    } catch (err) {
      if (err instanceof InvalidRecoveryCodeError) {
        this.setStatus(401);
        return { message: err.message };
      }
      throw err;
    }
  }

  // Prova end-to-end del meccanismo di identità (@Security('jwt') +
  // expressAuthentication): utile da subito al frontend per verificare/
  // ripristinare una sessione senza dover ripetere le credenziali.
  @Get('me')
  @Security('jwt')
  public async me(@Request() request: ExRequest): Promise<User> {
    return getAuthenticatedUser(request);
  }
}
