import type { Request as ExRequest } from 'express';
import { Body, Controller, Get, Path, Post, Put, Request, Response, Route, Security, SuccessResponse } from 'tsoa';
import { getAuthenticatedUser } from '../middleware/authentication';
import type { Company } from '../models/company';
import type { User } from '../models/user';
import { createEmployee, getCompanyById, registerCompany, updateCompany } from '../services/companyService';
import { signSessionToken } from '../services/tokenService';
import { UserConflictError } from '../services/userService';
import { isValidEmail, isValidPassword, PASSWORD_POLICY_MESSAGE } from '../utils/validation';

// Campi opzionali, ma quando presenti (stringa non vuota) devono avere un
// formato plausibile: P.IVA italiana a 11 cifre, codice fiscale a 11 cifre
// (azienda) o 16 caratteri alfanumerici (persona fisica, es. ditta
// individuale). Non è una validazione di checksum: come isValidEmail/
// isValidPassword in utils/validation.ts, scarta solo i casi palesemente
// sbagliati prima che finiscano su un documento fiscale.
const PIVA_REGEX = /^\d{11}$/;
const CODICE_FISCALE_REGEX = /^(\d{11}|[A-Za-z0-9]{16})$/;

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
  // In chiaro, una volta sola (vedi companyService.registerCompany): il
  // frontend deve mostrarlo con un avviso esplicito prima di procedere alla
  // dashboard, perché non sarà più recuperabile da qui.
  recoveryCode: string;
}

// Stringa vuota e null sono equivalenti in ingresso ("campo non compilato"):
// il controller normalizza entrambi a null prima di passarli al service,
// così l'owner può anche svuotare un campo già compilato in precedenza.
export interface UpdateCompanyRequest {
  name: string;
  ragioneSociale?: string | null;
  piva?: string | null;
  codiceFiscale?: string | null;
  indirizzo?: string | null;
  pec?: string | null;
}

export interface CreateEmployeeRequest {
  username: string;
  email: string;
  password: string;
  // Assente/'employee' = dipendente (comportamento storico). 'manager' crea
  // invece un project manager: stesso account, stesso flusso di primo
  // accesso, ma con permessi più ampi (vedi @Security('manager') su
  // projectController.ts e userController.ts).
  role?: 'employee' | 'manager';
}

// Un :id nel path che non combacia con la company del richiedente risponde
// 404, non 403: stesso principio di notFoundResponse in userController.ts,
// non conferma con un 403 l'esistenza di una company fuori dal proprio
// ambito.
function companyNotFoundResponse(id: string): CompanyErrorResponse {
  return { message: `Company con id ${id} non trovata` };
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
      const { user, company, recoveryCode } = await registerCompany({
        companyName: body.companyName,
        username: body.username,
        email: body.email,
        password: body.password,
      });
      const token = signSessionToken(user.id);
      this.setStatus(201);
      return { user, company, token, recoveryCode };
    } catch (err) {
      if (err instanceof UserConflictError) {
        this.setStatus(409);
        return { message: err.message };
      }
      throw err;
    }
  }

  // Visibile a chiunque sia autenticato nella company (non solo owner): il
  // nome compare in topbar per ogni ruolo, a differenza di createEmployee
  // sotto che resta un'azione riservata all'owner. Stesso principio 404 di
  // companyNotFoundResponse sopra: un id fuori dalla propria company non va
  // confermato con un 403.
  @Get('{id}')
  @Security('jwt')
  @Response<CompanyErrorResponse>(404, 'Company non trovata')
  public async getCompany(
    @Path() id: string,
    @Request() request: ExRequest,
  ): Promise<Company | CompanyErrorResponse> {
    const requester = getAuthenticatedUser(request);
    if (requester.companyId === null || id !== requester.companyId) {
      this.setStatus(404);
      return companyNotFoundResponse(id);
    }

    const company = await getCompanyById(id);
    if (!company) {
      this.setStatus(404);
      return companyNotFoundResponse(id);
    }
    return company;
  }

  // Riservato all'owner (a differenza di getCompany sopra, visibile a
  // chiunque nella company): sono gli stessi dati che finiscono in fattura,
  // stesso livello di riservatezza dei backup (backupController.ts) e della
  // gestione dipendenti sotto.
  @Put('{id}')
  @Security('owner')
  @Response<CompanyErrorResponse>(404, 'Company non trovata')
  @Response<CompanyErrorResponse>(422, 'name, piva, codiceFiscale o pec non validi')
  public async updateCompany(
    @Path() id: string,
    @Body() body: UpdateCompanyRequest,
    @Request() request: ExRequest,
  ): Promise<Company | CompanyErrorResponse> {
    const requester = getAuthenticatedUser(request);
    if (requester.companyId === null || id !== requester.companyId) {
      this.setStatus(404);
      return companyNotFoundResponse(id);
    }

    if (body.name.trim().length === 0) {
      this.setStatus(422);
      return { message: "Il nome dell'azienda non può essere vuoto" };
    }
    const piva = body.piva?.trim() || null;
    if (piva !== null && !PIVA_REGEX.test(piva)) {
      this.setStatus(422);
      return { message: 'piva deve essere composta da 11 cifre' };
    }
    const codiceFiscale = body.codiceFiscale?.trim() || null;
    if (codiceFiscale !== null && !CODICE_FISCALE_REGEX.test(codiceFiscale)) {
      this.setStatus(422);
      return { message: 'codiceFiscale deve essere di 11 cifre o 16 caratteri alfanumerici' };
    }
    const pec = body.pec?.trim() || null;
    if (pec !== null && !isValidEmail(pec)) {
      this.setStatus(422);
      return { message: 'pec non valida' };
    }

    const updated = await updateCompany(id, {
      name: body.name.trim(),
      ragioneSociale: body.ragioneSociale?.trim() || null,
      piva,
      codiceFiscale,
      indirizzo: body.indirizzo?.trim() || null,
      pec,
    });
    return updated;
  }

  // Nessun self-signup per dipendenti: solo l'owner autenticato della
  // company crea le loro credenziali (punto 3 del task "Azienda
  // multi-utente"), a differenza di register() sopra che è pubblico.
  @Post('{id}/employees')
  @Security('owner')
  @SuccessResponse(201, 'Dipendente creato')
  @Response<CompanyErrorResponse>(404, 'Company non trovata')
  @Response<CompanyErrorResponse>(422, 'username, email o password non validi')
  @Response<CompanyErrorResponse>(409, 'username o email già in uso')
  public async createEmployee(
    @Path() id: string,
    @Body() body: CreateEmployeeRequest,
    @Request() request: ExRequest,
  ): Promise<User | CompanyErrorResponse> {
    const requester = getAuthenticatedUser(request);
    // @Security('owner') garantisce role === 'owner', ma companyId resta
    // tipizzato string | null (vedi models/user.ts): trattato qui come 404
    // invece di lasciarlo risalire come TypeError, per lo stesso principio di
    // notFoundResponse sopra, anche se nella pratica del dominio attuale un
    // owner ha sempre una company_id valorizzata.
    if (requester.companyId === null || id !== requester.companyId) {
      this.setStatus(404);
      return companyNotFoundResponse(id);
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
      const employee = await createEmployee(requester.companyId, {
        username: body.username,
        email: body.email,
        password: body.password,
        role: body.role,
      });
      this.setStatus(201);
      return employee;
    } catch (err) {
      if (err instanceof UserConflictError) {
        this.setStatus(409);
        return { message: err.message };
      }
      throw err;
    }
  }
}
