import { API_BASE_URL, readErrorMessage } from "../httpClient";
import { authHeader } from "../auth/authService";

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

export interface RegisteredUser {
  id: string;
  username: string;
  email: string;
  companyId: string | null;
  role: "owner" | "manager" | "employee" | null;
  mustChangePassword: boolean;
}

export interface RegisterCompanyResult {
  user: RegisteredUser;
  company: RegisteredCompany;
  // Token già firmato dal backend (vedi companyController.ts): la
  // registrazione non richiede più una POST /auth/login separata subito dopo.
  token: string;
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

export interface CreateEmployeeInput {
  username: string;
  email: string;
  password: string;
  // Assente = dipendente (comportamento storico): vedi CreateEmployeeRequest
  // in backend/src/controllers/companyController.ts.
  role?: "employee" | "manager";
}

// Nessun self-signup per i dipendenti (backend/src/controllers/companyController.ts,
// @Security('owner')): solo l'owner autenticato può chiamarla, da qui il token in header.
export async function createEmployee(
  companyId: string,
  input: CreateEmployeeInput,
): Promise<RegisteredUser> {
  const response = await fetch(`${API_BASE_URL}/companies/${companyId}/employees`, {
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

  return (await response.json()) as RegisteredUser;
}
