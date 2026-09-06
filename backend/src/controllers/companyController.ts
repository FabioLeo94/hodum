import type { Request as ExRequest } from 'express';
import { Body, Controller, Delete, Get, Path, Post, Put, Request, Response, Route, Security, SuccessResponse } from '@tsoa/runtime';
import { getAuthenticatedUser } from '../middleware/authentication';
import type { Company, RateUnit } from '../models/company';
import type { User } from '../models/user';
import {
  createEmployee,
  deleteCompany as deleteCompanyService,
  getCompanyById,
  ImportCompanyDataError,
  importCompanyData,
  InvalidCompanyDataError,
  registerCompany,
  updateCompany,
  type TemporaryPasswordEntry,
} from '../services/companyService';
import { type CompanyExportData, exportCompanyData } from '../services/exportService';
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
  // Opzionale da migrations/0041: se assente si mostra "nome cognome" (vedi
  // firstName/lastName sotto).
  username?: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  pronoun?: string;
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

// Corpo di POST /companies/import: l'intero payload prodotto da
// GET /companies/{id}/export (CompanyExportData) più la password che l'owner
// sceglie per LA NUOVA istanza di destinazione — mai quella originale, che
// non esiste nell'export in primo luogo (models/user.ts non espone mai la
// colonna password).
export interface ImportCompanyRequest {
  export: CompanyExportData;
  ownerPassword: string;
}

// Stessa forma di RegisterCompanyResponse più temporaryPasswords: mostrate
// una sola volta dal frontend (stesso principio del recoveryCode), da
// consegnare ai dipendenti/manager importati fuori banda.
export interface ImportCompanyResponse {
  user: User;
  company: Company;
  token: string;
  recoveryCode: string;
  temporaryPasswords: TemporaryPasswordEntry[];
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
  // Se assente/null: nessuna tariffa impostata, tariffaUnita viene forzato a
  // null indipendentemente da cosa arriva nel body (vedi updateCompany sotto).
  tariffaOraria?: number | null;
  tariffaUnita?: RateUnit | null;
  giorniLavorativi?: {
    lunedi: boolean;
    martedi: boolean;
    mercoledi: boolean;
    giovedi: boolean;
    venerdi: boolean;
    sabato: boolean;
    domenica: boolean;
  };
  orarioLavoro?: {
    continuativo: boolean;
    inizio1: string | null;
    fine1: string | null;
    inizio2: string | null;
    fine2: string | null;
  };
}

export interface CreateEmployeeRequest {
  // Opzionale da migrations/0041, stesso trattamento di RegisterCompanyRequest.
  username?: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  pronoun?: string;
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
    // "campo vuoto dopo trim" su companyName/username ora validato in
    // companyService.registerCompany (punto 2 della code review "niente
    // logica nei controller"): la ValidationError che lancia è mappata a 422
    // nell'error handler globale (app.ts), non qui.
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
        firstName: body.firstName,
        lastName: body.lastName,
        pronoun: body.pronoun,
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

  // Punto 2 del piano "Export/import e cancellazione completa di account e
  // azienda": riservato all'owner, stesso controllo di scoping di
  // updateCompany sotto (non di getCompany sopra, visibile a chiunque nella
  // company: qui invece escono anche gli utenti, i task e i backup metadata di
  // tutti, un livello di dettaglio riservato).
  @Get('{id}/export')
  @Security('owner')
  @Response<CompanyErrorResponse>(404, 'Company non trovata')
  public async exportCompany(
    @Path() id: string,
    @Request() request: ExRequest,
  ): Promise<CompanyExportData | CompanyErrorResponse> {
    const requester = getAuthenticatedUser(request);
    if (requester.companyId === null || id !== requester.companyId) {
      this.setStatus(404);
      return companyNotFoundResponse(id);
    }
    return exportCompanyData(id);
  }

  // Riservato all'owner (a differenza di getCompany sopra, visibile a
  // chiunque nella company): sono gli stessi dati che finiscono in fattura,
  // stesso livello di riservatezza dei backup (backupController.ts) e della
  // gestione dipendenti sotto.
  @Put('{id}')
  @Security('owner')
  @Response<CompanyErrorResponse>(404, 'Company non trovata')
  @Response<CompanyErrorResponse>(
    422,
    'name, piva, codiceFiscale, pec, tariffaOraria, tariffaUnita o orarioLavoro non validi',
  )
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

    // Punto 1 della code review "niente logica nei controller": validazione
    // di P.IVA/codice fiscale/PEC, accoppiamento tariffa e fasce orarie sono
    // regole di dominio, spostate in companyService.updateCompany. Il
    // controller si limita a inoltrare il body e mappare InvalidCompanyDataError
    // a 422.
    try {
      return await updateCompany(id, body);
    } catch (err) {
      if (err instanceof InvalidCompanyDataError) {
        this.setStatus(422);
        return { message: err.message };
      }
      throw err;
    }
  }

  // Punto 3 del piano: elimina l'intera azienda, incluso l'owner stesso
  // (l'unico ruolo che può chiamare questa rotta). Nessun body richiesto: la
  // conferma per nome esatto dell'azienda ("ridigita il nome dell'azienda")
  // è validata lato frontend prima della chiamata, stesso pattern
  // "conferma poi chiama" già usato da deleteEmployeeModal. Stesso controllo
  // di scoping di updateCompany sopra.
  @Delete('{id}')
  @Security('owner')
  @SuccessResponse(204, 'Azienda eliminata')
  @Response<CompanyErrorResponse>(404, 'Company non trovata')
  public async deleteCompany(@Path() id: string, @Request() request: ExRequest): Promise<void> {
    const requester = getAuthenticatedUser(request);
    if (requester.companyId === null || id !== requester.companyId) {
      this.setStatus(404);
      return;
    }
    await deleteCompanyService(id, requester.id);
    this.setStatus(204);
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

    // "username non può essere vuoto" ora validato in companyService.createEmployee
    // (punto 2 della code review "niente logica nei controller"): la
    // ValidationError che lancia è mappata a 422 nell'error handler globale
    // (app.ts), non qui. email/password restano validate qui (fuori dallo
    // scope di quell'intervento).
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
        firstName: body.firstName,
        lastName: body.lastName,
        pronoun: body.pronoun,
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

  // Punto 4 del piano: endpoint pubblico deliberatamente, stesso principio di
  // register() sopra — è l'unico modo di popolare un'istanza vuota a partire
  // da un export prodotto da GET /companies/{id}/export su un'altra
  // installazione, senza avere già una sessione su QUESTA. Il limite più alto
  // sul body JSON di questa singola rotta è applicato in app.ts (un export
  // aziendale con molti progetti/task/commenti può superare il limite globale
  // di 1mb), non qui: tsoa non ha modo di dichiarare un limite per-rotta.
  @Post('import')
  @SuccessResponse(201, 'Azienda importata')
  @Response<CompanyErrorResponse>(422, "export malformato o ownerPassword non valida")
  @Response<CompanyErrorResponse>(409, "username o email dell'export già in uso su questa istanza")
  public async importCompany(
    @Body() body: ImportCompanyRequest,
  ): Promise<ImportCompanyResponse | CompanyErrorResponse> {
    // Punto 1 della code review "niente logica nei controller": la
    // validazione del payload (~110 righe, ex validateImportPayload qui) è
    // stata spostata in companyService.importCompanyData, eseguita PRIMA di
    // aprire la transazione (stesso principio di prima: un payload malformato
    // risponde 422 senza aver toccato il database). Il controller intercetta
    // ImportCompanyDataError e risponde 422.
    try {
      const { user, company, recoveryCode, temporaryPasswords } = await importCompanyData({
        data: body.export,
        ownerPassword: body.ownerPassword,
      });
      const token = signSessionToken(user.id);
      this.setStatus(201);
      return { user, company, token, recoveryCode, temporaryPasswords };
    } catch (err) {
      if (err instanceof ImportCompanyDataError) {
        this.setStatus(422);
        return { message: err.message };
      }
      if (err instanceof UserConflictError) {
        this.setStatus(409);
        return { message: err.message };
      }
      throw err;
    }
  }
}
