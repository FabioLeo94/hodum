import { API_BASE_URL, readErrorMessage } from "../httpClient";
import { authFetch, authHeader } from "../auth/authService";
import type { EmployeeRole, User } from "../auth/authService";
import type { BackupRecord } from "../backup/backupService";
import type {
  ExportProject,
  ExportTaskComment,
  ExportTaskWithProject,
} from "../../../shared/types/companyExport";

export interface RegisterCompanyInput {
  companyName: string;
  username: string;
  email: string;
  password: string;
}

// Stessa forma di Company esposta dal backend (vedi
// backend/src/models/company.ts): i campi anagrafici sono null finché
// l'owner non li compila dal drawer "Modifica dati aziendali".
export interface RegisteredCompany {
  id: string;
  name: string;
  ownerId: string;
  ragioneSociale: string | null;
  piva: string | null;
  codiceFiscale: string | null;
  indirizzo: string | null;
  pec: string | null;
  createdAt: string;
}

export interface RegisterCompanyResult {
  // Stessa forma di un utente autenticato qualunque (vedi User in
  // authService.ts): chi si registra diventa owner della company appena creata.
  user: User;
  company: RegisteredCompany;
  // Token già firmato dal backend (vedi companyController.ts): la
  // registrazione non richiede più una POST /auth/login separata subito dopo.
  token: string;
  // In chiaro, una volta sola (vedi backend/src/services/companyService.ts):
  // va mostrato all'utente con un avviso esplicito prima di procedere, non
  // sarà più recuperabile da qui.
  recoveryCode: string;
}

export async function registerCompany(
  input: RegisterCompanyInput,
): Promise<RegisterCompanyResult> {
  const response = await fetch(`${API_BASE_URL}/companies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    if (response.status === 409) {
      throw new Error(message ?? "Username o email già in uso.");
    }
    if (response.status === 422) {
      throw new Error(message ?? "Dati non validi. Controlla i campi inseriti.");
    }
    throw new Error(message ?? "Registrazione non riuscita. Riprova più tardi.");
  }

  return (await response.json()) as RegisterCompanyResult;
}

// Stessa forma di getProjectName in projectService.ts: undefined su 404 (id
// fuori dalla propria company) invece di lanciare, così il chiamante può
// scegliere di non mostrare nulla senza dover distinguere un errore vero.
export async function getCompany(id: string): Promise<RegisteredCompany | undefined> {
  const response = await authFetch(`${API_BASE_URL}/companies/${id}`, { headers: authHeader() });
  if (response.status === 404) {
    return undefined;
  }
  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message ?? "Impossibile caricare l'azienda.");
  }
  return (await response.json()) as RegisteredCompany;
}

export async function getCompanyName(id: string): Promise<string | undefined> {
  const company = await getCompany(id);
  return company?.name;
}

export interface UpdateCompanyInput {
  name: string;
  ragioneSociale: string | null;
  piva: string | null;
  codiceFiscale: string | null;
  indirizzo: string | null;
  pec: string | null;
}

// Riservato all'owner (backend @Security('owner')): stesso principio di
// createEmployee sotto, il token va sempre in header.
export async function updateCompany(id: string, input: UpdateCompanyInput): Promise<RegisteredCompany> {
  const response = await authFetch(`${API_BASE_URL}/companies/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    if (response.status === 422) {
      throw new Error(message ?? "Dati non validi. Controlla i campi inseriti.");
    }
    throw new Error(message ?? "Impossibile salvare i dati aziendali.");
  }

  return (await response.json()) as RegisteredCompany;
}

export interface CreateEmployeeInput {
  username: string;
  email: string;
  password: string;
  // Assente = dipendente (comportamento storico): vedi CreateEmployeeRequest
  // in backend/src/controllers/companyController.ts.
  role?: EmployeeRole;
}

// Nessun self-signup per i dipendenti (backend/src/controllers/companyController.ts,
// @Security('owner')): solo l'owner autenticato può chiamarla, da qui il token in header.
export async function createEmployee(
  companyId: string,
  input: CreateEmployeeInput,
): Promise<User> {
  const response = await authFetch(`${API_BASE_URL}/companies/${companyId}/employees`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    if (response.status === 409) {
      throw new Error(message ?? "Username o email già in uso.");
    }
    if (response.status === 422) {
      throw new Error(message ?? "Dati non validi. Controlla i campi inseriti.");
    }
    throw new Error(message ?? "Creazione del dipendente non riuscita. Riprova più tardi.");
  }

  return (await response.json()) as User;
}

// Coppia (projectId, userId): stessa forma restituita da
// listAllAssignmentsByCompany lato backend, vista pubblica dell'export.
export interface CompanyExportProjectAssignment {
  projectId: string;
  userId: string;
}

// Forma esatta di GET /companies/{id}/export (vedi backend/src/services/exportService.ts,
// CompanyExportData): stessa struttura usata sia per lo scaricamento
// dell'export sia come corpo di importCompany sotto, per un'altra istanza.
export interface CompanyExportData {
  company: RegisteredCompany;
  users: User[];
  projects: ExportProject[];
  projectAssignments: CompanyExportProjectAssignment[];
  tasks: ExportTaskWithProject[];
  comments: ExportTaskComment[];
  backups: BackupRecord[];
}

// Riservato all'owner (backend @Security('owner')), stesso scoping 404 di
// updateCompany sopra: qui escono anche utenti, task e backup metadata di
// tutta l'azienda, un livello di dettaglio più ampio di getCompany.
export async function exportCompanyData(id: string): Promise<CompanyExportData> {
  const response = await authFetch(`${API_BASE_URL}/companies/${id}/export`, {
    headers: authHeader(),
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message ?? "Impossibile esportare i dati dell'azienda. Riprova più tardi.");
  }

  return (await response.json()) as CompanyExportData;
}

// Elimina l'intera azienda, incluso l'owner stesso (backend @Security('owner')):
// 204 senza corpo, la conferma per nome esatto è già stata validata lato
// frontend da DeleteCompanyModalComponent prima di questa chiamata.
export async function deleteCompany(id: string): Promise<void> {
  const response = await authFetch(`${API_BASE_URL}/companies/${id}`, {
    method: "DELETE",
    headers: authHeader(),
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message ?? "Impossibile eliminare l'azienda. Riprova più tardi.");
  }
}

// Credenziali generate per un dipendente/manager importato (mai per l'owner,
// che sceglie la propria password fresca): mostrate una sola volta dal
// frontend, stesso principio del recoveryCode, mai più recuperabili da qui.
export interface TemporaryPasswordEntry {
  username: string;
  role: EmployeeRole;
  password: string;
}

export interface ImportCompanyInput {
  export: CompanyExportData;
  // Password scelta dall'owner per LA NUOVA istanza: mai quella originale,
  // che non esiste nell'export in primo luogo (User non espone mai la password).
  ownerPassword: string;
}

export interface ImportCompanyResult {
  user: User;
  company: RegisteredCompany;
  token: string;
  recoveryCode: string;
  temporaryPasswords: TemporaryPasswordEntry[];
}

// Endpoint pubblico deliberatamente (nessuna sessione su QUESTA istanza,
// stesso principio di registerCompany sopra): è l'unico modo di popolare
// un'istanza vuota a partire da un export prodotto da exportCompanyData su
// un'altra installazione.
export async function importCompany(input: ImportCompanyInput): Promise<ImportCompanyResult> {
  const response = await fetch(`${API_BASE_URL}/companies/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    if (response.status === 409) {
      throw new Error(message ?? "Username o email dell'export già in uso su questa istanza.");
    }
    if (response.status === 422) {
      throw new Error(message ?? "Export non valido o password non conforme.");
    }
    throw new Error(message ?? "Importazione non riuscita. Riprova più tardi.");
  }

  return (await response.json()) as ImportCompanyResult;
}
