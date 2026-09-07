import { API_BASE_URL, readErrorMessage } from "../httpClient";
import { authFetch, authHeader } from "../auth/authService";
import type { Customer } from "../../../shared/types/customer";
import type { CurrencyCode } from "../../../shared/utils/currency";
import type { RateUnit } from "../../../shared/utils/rateConversion";

// Riservato all'owner (backend @Security('owner')): stesso principio di
// updateCompany/createEmployee in companyService.ts, la pagina che chiama
// queste funzioni (companyManagement.tsx) è già owner-only.
export async function getAllCustomers(): Promise<Customer[]> {
  const response = await authFetch(`${API_BASE_URL}/customers`, { headers: authHeader() });
  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message ?? "Impossibile caricare i clienti.");
  }
  return (await response.json()) as Customer[];
}

// Solo id e nome: a differenza di getAllCustomers (owner-only lato backend),
// GET /customers/summary è @Security('manager'), pensata per la dropdown di
// assegnazione cliente in EditProjectModalComponent, usata anche dal
// project manager (stesso principio di ProjectSummary in projectService.ts).
export interface CustomerSummary {
  id: string;
  name: string;
}

export async function listCustomerSummaries(): Promise<CustomerSummary[]> {
  const response = await authFetch(`${API_BASE_URL}/customers/summary`, { headers: authHeader() });
  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message ?? "Impossibile caricare i clienti.");
  }
  return (await response.json()) as CustomerSummary[];
}

export interface CreateCustomerInput {
  name: string;
  description?: string | null;
  tariffaOraria?: number | null;
  tariffaUnita?: RateUnit | null;
  valuta?: CurrencyCode | null;
}

export async function createCustomer(input: CreateCustomerInput): Promise<Customer> {
  const response = await authFetch(`${API_BASE_URL}/customers`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const message = await readErrorMessage(response);
    if (response.status === 422) {
      throw new Error(message ?? "Dati non validi. Controlla i campi inseriti.");
    }
    throw new Error(message ?? "Impossibile creare il cliente.");
  }
  return (await response.json()) as Customer;
}

export interface UpdateCustomerInput {
  name: string;
  description?: string | null;
  tariffaOraria?: number | null;
  tariffaUnita?: RateUnit | null;
  valuta?: CurrencyCode | null;
}

export async function updateCustomer(id: string, input: UpdateCustomerInput): Promise<Customer> {
  const response = await authFetch(`${API_BASE_URL}/customers/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const message = await readErrorMessage(response);
    if (response.status === 422) {
      throw new Error(message ?? "Dati non validi. Controlla i campi inseriti.");
    }
    throw new Error(message ?? "Impossibile aggiornare il cliente.");
  }
  return (await response.json()) as Customer;
}

export async function deleteCustomer(id: string): Promise<void> {
  const response = await authFetch(`${API_BASE_URL}/customers/${id}`, {
    method: "DELETE",
    headers: authHeader(),
  });
  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message ?? "Impossibile eliminare il cliente.");
  }
}
