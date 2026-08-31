import type { Request as ExRequest } from 'express';
import { Body, Controller, Get, Post, Request, Response, Route, Security } from 'tsoa';
import { getAuthenticatedUser } from '../middleware/authentication';
import type { User } from '../models/user';
import { InvalidCredentialsError, login } from '../services/authService';
import { signSessionToken } from '../services/tokenService';

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

  // Prova end-to-end del meccanismo di identità (@Security('jwt') +
  // expressAuthentication): utile da subito al frontend per verificare/
  // ripristinare una sessione senza dover ripetere le credenziali.
  @Get('me')
  @Security('jwt')
  public async me(@Request() request: ExRequest): Promise<User> {
    return getAuthenticatedUser(request);
  }
}
