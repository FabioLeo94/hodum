import type { Request as ExRequest } from 'express';
import { Body, Controller, Delete, Get, Path, Post, Put, Request, Response, Route, Security, SuccessResponse } from 'tsoa';
import { getAuthenticatedUser } from '../middleware/authentication';
import type { Company, RateUnit } from '../models/company';
import type { User } from '../models/user';
import {
  createEmployee,
  deleteCompany as deleteCompanyService,
  getCompanyById,
  importCompanyData,
  registerCompany,
  updateCompany,
  type TemporaryPasswordEntry,
} from '../services/companyService';
import { type CompanyExportData, exportCompanyData } from '../services/exportService';
import { signSessionToken } from '../services/tokenService';
import { UserConflictError } from '../services/userService';
import { isValidDueDate, isValidPriority, isValidTaskStatus } from '../services/taskService';
import { isValidEmail, isValidPassword, PASSWORD_POLICY_MESSAGE } from '../utils/validation';

// Campi opzionali, ma quando presenti (stringa non vuota) devono avere un
// formato plausibile: P.IVA italiana a 11 cifre, codice fiscale a 11 cifre
// (azienda) o 16 caratteri alfanumerici (persona fisica, es. ditta
// individuale). Non è una validazione di checksum: come isValidEmail/
// isValidPassword in utils/validation.ts, scarta solo i casi palesemente
// sbagliati prima che finiscano su un documento fiscale.
const PIVA_REGEX = /^\d{11}$/;
const CODICE_FISCALE_REGEX = /^(\d{11}|[A-Za-z0-9]{16})$/;
// Formato orario accettato per inizio1/fine1/inizio2/fine2: "HH:mm", stesso
// formato in cui il service normalizza le colonne time in lettura
// (companyService.normalizeTime).
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
// Stessi 5 valori del CHECK su companies.tariffa_unita (migration 0033).
const RATE_UNITS: RateUnit[] = ['oraria', 'giornaliera', 'settimanale', 'mensile', 'annuale'];

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

// Punto 4 del piano: stessa disciplina di validazione di register()/
// updateCompany() sotto (isValidEmail/isValidPassword/PIVA_REGEX/
// CODICE_FISCALE_REGEX riapplicati riga per riga), qui su un intero payload
// annidato invece che su pochi campi flat. Eseguita PRIMA di aprire la
// transazione in importCompanyData: un payload malformato deve rispondere 422
// senza aver toccato il database, non emergere a metà transazione come un
// errore Postgres generico. Restituisce il primo messaggio di errore trovato,
// o null se il payload è accettabile.
function validateImportPayload(body: ImportCompanyRequest): string | null {
  if (!isValidPassword(body.ownerPassword)) {
    return PASSWORD_POLICY_MESSAGE;
  }

  const data = body.export;
  if (!data || typeof data !== 'object') {
    return "il campo 'export' è obbligatorio";
  }

  if (!data.company || data.company.name.trim().length === 0) {
    return "Il nome dell'azienda non può essere vuoto";
  }
  const piva = data.company.piva;
  if (piva !== null && piva !== undefined && piva !== '' && !PIVA_REGEX.test(piva)) {
    return 'piva deve essere composta da 11 cifre';
  }
  const codiceFiscale = data.company.codiceFiscale;
  if (codiceFiscale !== null && codiceFiscale !== undefined && codiceFiscale !== '' && !CODICE_FISCALE_REGEX.test(codiceFiscale)) {
    return 'codiceFiscale deve essere di 11 cifre o 16 caratteri alfanumerici';
  }
  const pec = data.company.pec;
  if (pec !== null && pec !== undefined && pec !== '' && !isValidEmail(pec)) {
    return 'pec non valida';
  }

  if (!Array.isArray(data.users) || data.users.length === 0) {
    return "il campo 'export.users' deve contenere almeno l'owner";
  }
  const owners = data.users.filter((u) => u.role === 'owner');
  if (owners.length !== 1 || owners[0].id !== data.company.ownerId) {
    return "l'export deve contenere esattamente un utente owner, con id uguale a export.company.ownerId";
  }
  for (const user of data.users) {
    if (user.username.trim().length === 0) {
      return 'username non può essere vuoto (in export.users)';
    }
    if (!isValidEmail(user.email)) {
      return 'email non valida (in export.users)';
    }
    if (user.role !== 'owner' && user.role !== 'manager' && user.role !== 'employee') {
      return "role deve essere 'owner', 'manager' o 'employee' (in export.users)";
    }
  }

  if (!Array.isArray(data.projects)) {
    return "il campo 'export.projects' deve essere un array";
  }
  const projectIds = new Set(data.projects.map((p) => p.id));
  for (const project of data.projects) {
    if (project.name.trim().length === 0) {
      return 'name non può essere vuoto (in export.projects)';
    }
  }

  if (!Array.isArray(data.projectAssignments)) {
    return "il campo 'export.projectAssignments' deve essere un array";
  }
  const userIds = new Set(data.users.map((u) => u.id));
  for (const assignment of data.projectAssignments) {
    if (!projectIds.has(assignment.projectId) || !userIds.has(assignment.userId)) {
      return 'export.projectAssignments contiene un riferimento a un progetto o utente non presente nello stesso export';
    }
  }

  if (!Array.isArray(data.tasks)) {
    return "il campo 'export.tasks' deve essere un array";
  }
  const taskIds = new Set(data.tasks.map((t) => t.id));
  for (const task of data.tasks) {
    if (task.title.trim().length === 0) {
      return 'title non può essere vuoto (in export.tasks)';
    }
    if (!projectIds.has(task.projectId)) {
      return 'export.tasks contiene un riferimento a un progetto non presente nello stesso export';
    }
    if (!isValidTaskStatus(task.status)) {
      return 'status non valido (in export.tasks)';
    }
    if (!isValidPriority(task.priority)) {
      return 'priority deve essere un intero tra 1 e 10 (in export.tasks)';
    }
    if (task.dueDate !== null && !isValidDueDate(task.dueDate)) {
      return 'dueDate non valida (in export.tasks)';
    }
    for (const assignee of task.assignees) {
      if (!userIds.has(assignee.id)) {
        return 'export.tasks contiene un assegnatario non presente in export.users';
      }
    }
  }

  if (!Array.isArray(data.comments)) {
    return "il campo 'export.comments' deve essere un array";
  }
  for (const comment of data.comments) {
    if (comment.body.trim().length === 0) {
      return 'body non può essere vuoto (in export.comments)';
    }
    if (!taskIds.has(comment.taskId)) {
      return 'export.comments contiene un riferimento a un task non presente nello stesso export';
    }
    if (!userIds.has(comment.authorId)) {
      return 'export.comments contiene un riferimento a un autore non presente in export.users';
    }
  }

  return null;
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

    // Accoppiamento tariffaOraria/tariffaUnita: niente unità senza un valore
    // (forzata a null), default 'oraria' se il valore c'è ma l'unità manca
    // (vedi CLAUDE.md/task: la conversione tra unità è calcolo frontend, qui
    // si valida solo la coppia canonica).
    if (
      body.tariffaOraria !== undefined &&
      body.tariffaOraria !== null &&
      (typeof body.tariffaOraria !== 'number' || Number.isNaN(body.tariffaOraria) || body.tariffaOraria < 0)
    ) {
      this.setStatus(422);
      return { message: 'tariffaOraria deve essere un numero maggiore o uguale a 0' };
    }
    const tariffaOraria = body.tariffaOraria ?? null;
    let tariffaUnita: RateUnit | null = null;
    if (tariffaOraria !== null) {
      tariffaUnita = body.tariffaUnita ?? 'oraria';
      if (!RATE_UNITS.includes(tariffaUnita)) {
        this.setStatus(422);
        return { message: `tariffaUnita deve essere una tra: ${RATE_UNITS.join(', ')}` };
      }
    }

    // Assente = nessun giorno lavorativo impostato, coerente col default
    // false della migration: un PUT che non lo invia azzera i giorni già
    // impostati, stesso comportamento "rappresentazione intera" già in uso
    // per ragioneSociale/piva/ecc. sopra.
    const giorniLavorativi = body.giorniLavorativi ?? {
      lunedi: false,
      martedi: false,
      mercoledi: false,
      giovedi: false,
      venerdi: false,
      sabato: false,
      domenica: false,
    };

    // Assente = fascia unica non impostata, coerente col DEFAULT della
    // migration (orario_continuativo true, ore tutte NULL).
    const orarioLavoroInput = body.orarioLavoro ?? {
      continuativo: true,
      inizio1: null,
      fine1: null,
      inizio2: null,
      fine2: null,
    };
    if (orarioLavoroInput.inizio1 !== null && !TIME_REGEX.test(orarioLavoroInput.inizio1)) {
      this.setStatus(422);
      return { message: 'orarioLavoro.inizio1 deve essere nel formato HH:mm' };
    }
    if (orarioLavoroInput.fine1 !== null && !TIME_REGEX.test(orarioLavoroInput.fine1)) {
      this.setStatus(422);
      return { message: 'orarioLavoro.fine1 deve essere nel formato HH:mm' };
    }
    if (
      orarioLavoroInput.inizio1 !== null &&
      orarioLavoroInput.fine1 !== null &&
      orarioLavoroInput.fine1 <= orarioLavoroInput.inizio1
    ) {
      this.setStatus(422);
      return { message: 'orarioLavoro.fine1 deve essere successivo a orarioLavoro.inizio1' };
    }

    // inizio2/fine2 non sono significative quando continuativo è true: si
    // azzerano a prescindere da cosa arriva nel body, non si valida un dato
    // che verrà comunque scartato.
    let inizio2 = orarioLavoroInput.inizio2;
    let fine2 = orarioLavoroInput.fine2;
    if (orarioLavoroInput.continuativo) {
      inizio2 = null;
      fine2 = null;
    } else {
      if (inizio2 !== null && !TIME_REGEX.test(inizio2)) {
        this.setStatus(422);
        return { message: 'orarioLavoro.inizio2 deve essere nel formato HH:mm' };
      }
      if (fine2 !== null && !TIME_REGEX.test(fine2)) {
        this.setStatus(422);
        return { message: 'orarioLavoro.fine2 deve essere nel formato HH:mm' };
      }
      if (inizio2 !== null && fine2 !== null && fine2 <= inizio2) {
        this.setStatus(422);
        return { message: 'orarioLavoro.fine2 deve essere successivo a orarioLavoro.inizio2' };
      }
    }

    const updated = await updateCompany(id, {
      name: body.name.trim(),
      ragioneSociale: body.ragioneSociale?.trim() || null,
      piva,
      codiceFiscale,
      indirizzo: body.indirizzo?.trim() || null,
      pec,
      tariffaOraria,
      tariffaUnita,
      giorniLavorativi,
      orarioLavoro: {
        continuativo: orarioLavoroInput.continuativo,
        inizio1: orarioLavoroInput.inizio1,
        fine1: orarioLavoroInput.fine1,
        inizio2,
        fine2,
      },
    });
    return updated;
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
    const validationError = validateImportPayload(body);
    if (validationError) {
      this.setStatus(422);
      return { message: validationError };
    }

    try {
      const { user, company, recoveryCode, temporaryPasswords } = await importCompanyData({
        data: body.export,
        ownerPassword: body.ownerPassword,
      });
      const token = signSessionToken(user.id);
      this.setStatus(201);
      return { user, company, token, recoveryCode, temporaryPasswords };
    } catch (err) {
      if (err instanceof UserConflictError) {
        this.setStatus(409);
        return { message: err.message };
      }
      throw err;
    }
  }
}
