import { API_BASE_URL, readErrorMessage } from "../httpClient";
import { authFetch, authHeader } from "../auth/authService";
import type { EmployeeRole, User } from "../auth/authService";

export interface RegisterCompanyInput {
  companyName: string;
  username: string;
  email: string;
  password: string;
}

export interface RegisteredCompany {
  id: string;
  name: string;
  ownerId: string;
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
export async function getCompanyName(id: string): Promise<string | undefined> {
  const response = await authFetch(`${API_BASE_URL}/companies/${id}`, { headers: authHeader() });
  if (response.status === 404) {
    return undefined;
  }
  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message ?? "Impossibile caricare l'azienda.");
  }
  const company = (await response.json()) as RegisteredCompany;
  return company.name;
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
