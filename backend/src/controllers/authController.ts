import { Body, Controller, Post, Response, Route } from 'tsoa';
import type { User } from '../models/user';
import { InvalidCredentialsError, login } from '../services/authService';

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

// Il path va scritto come stringa letterale: tsoa lo legge dall'AST prima
// dell'avvio, una costante importata non verrebbe risolta in generazione.
@Route('auth')
export class AuthController extends Controller {
  @Post('login')
  @Response<AuthErrorResponse>(401, 'Email o password non corretti')
  public async login(@Body() body: LoginRequest): Promise<User | AuthErrorResponse> {
    try {
      return await login(body.email, body.password);
    } catch (err) {
      if (err instanceof InvalidCredentialsError) {
        this.setStatus(401);
        return { message: err.message };
      }
      throw err;
    }
  }
}
