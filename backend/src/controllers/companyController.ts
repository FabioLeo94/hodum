import { Body, Controller, Post, Response, Route, SuccessResponse } from 'tsoa';
import type { Company } from '../models/company';
import type { User } from '../models/user';
import { registerCompany } from '../services/companyService';
import { signSessionToken } from '../services/tokenService';
import { UserConflictError } from '../services/userService';
import { isValidEmail, isValidPassword, PASSWORD_POLICY_MESSAGE } from '../utils/validation';

// Nome distinto dagli omonimi "ErrorResponse" degli altri controller: tsoa
// risolve i modelli per nome dell'interfaccia a livello globale (non per
// file), quindi collidono in generazione se condivisi.
interface CompanyErrorResponse {
  message: string;
}

export interface RegisterCompanyRequest {
  companyName: string;
  username: string;
  email: string;
  password: string;
}

export interface RegisterCompanyResponse {
  user: User;
  company: Company;
  // Token di sessione già firmato: evita al frontend una seconda chiamata a
  // POST /auth/login subito dopo la registrazione (come faceva il vecchio
  // flusso self-signup, vedi registerFormComponent.tsx).
  token: string;
}

// Il path va scritto come stringa letterale: tsoa lo legge dall'AST prima
// dell'avvio, una costante importata non verrebbe risolta in generazione.
@Route('companies')
export class CompanyController extends Controller {
  // Endpoint pubblico deliberatamente, come il vecchio POST /users che
  // sostituisce: è l'unico modo di ottenere un'azienda (e quindi un owner)
  // senza avere già una sessione. La creazione di dipendenti (punto 3 del
  // task "Azienda multi-utente") resta invece riservata a @Security('owner').
  @Post()
  @SuccessResponse(201, 'Azienda e utente owner creati')
  @Response<CompanyErrorResponse>(422, 'companyName, username, email o password non validi')
  @Response<CompanyErrorResponse>(409, 'username o email già in uso')
  public async register(
    @Body() body: RegisterCompanyRequest,
  ): Promise<RegisterCompanyResponse | CompanyErrorResponse> {
    if (body.companyName.trim().length === 0) {
      this.setStatus(422);
      return { message: "Il nome dell'azienda non può essere vuoto" };
    }
    if (body.username.trim().length === 0) {
      this.setStatus(422);
      return { message: 'username non può essere vuoto' };
    }
    if (!isValidEmail(body.email)) {
      this.setStatus(422);
      return { message: 'email non valida' };
    }
    if (!isValidPassword(body.password)) {
      this.setStatus(422);
      return { message: PASSWORD_POLICY_MESSAGE };
    }

    try {
      const { user, company } = await registerCompany({
        companyName: body.companyName,
        username: body.username,
        email: body.email,
        password: body.password,
      });
      const token = signSessionToken(user.id);
      this.setStatus(201);
      return { user, company, token };
    } catch (err) {
      if (err instanceof UserConflictError) {
        this.setStatus(409);
        return { message: err.message };
      }
      throw err;
    }
  }
}
