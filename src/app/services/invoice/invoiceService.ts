import { API_BASE_URL, readErrorMessage } from "../httpClient";
import { authFetch, authHeader } from "../auth/authService";
import type { BillableTask, Invoice, InvoiceWithItems } from "../../../shared/types/invoice";

// Riservato all'owner (backend @Security('owner') su tutti gli endpoint
// invoice, vedi invoiceController.ts): stesso principio di customerService.ts,
// i chiamanti (pagina invoices.tsx e i suoi drawer/modali) sono già owner-only.

export interface TaskSelection {
  taskId: string;
  nonFatturabile: boolean;
}

// 404 cliente non trovato, 409 un task selezionato non è più fatturabile
// oppure una generazione è già in corso per l'azienda, 422 nessun task
// selezionato o nessuna tariffa impostata: messaggi di default solo come
// fallback, il body del backend è già pensato per essere mostrato all'utente.
export async function generateInvoice(
  customerId: string,
  taskSelections: TaskSelection[],
): Promise<Invoice> {
  const response = await authFetch(`${API_BASE_URL}/customers/${customerId}/invoices`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify({ taskSelections }),
  });
  if (!response.ok) {
    const message = await readErrorMessage(response);
    if (response.status === 404) {
      throw new Error(message ?? "Cliente non trovato.");
    }
    if (response.status === 409) {
      throw new Error(
        message ??
          "Impossibile generare la pre-fattura: un task selezionato non è più fatturabile, oppure è già in corso un'altra generazione per l'azienda.",
      );
    }
    if (response.status === 422) {
      throw new Error(
        message ?? "Seleziona almeno un task e verifica che al cliente sia impostata una tariffa.",
      );
    }
    throw new Error(message ?? "Impossibile generare la pre-fattura.");
  }
  return (await response.json()) as Invoice;
}

// 404 pre-fattura non trovata (o di un'altra company), 409 già annullata:
// stesso schema di generateInvoice sopra, messaggi di default solo come
// fallback.
export async function cancelInvoice(invoiceId: string): Promise<Invoice> {
  const response = await authFetch(`${API_BASE_URL}/invoices/${invoiceId}/cancel`, {
    method: "POST",
    headers: authHeader(),
  });
  if (!response.ok) {
    const message = await readErrorMessage(response);
    if (response.status === 404) {
      throw new Error(message ?? "Pre-fattura non trovata.");
    }
    if (response.status === 409) {
      throw new Error(message ?? "La pre-fattura è già stata annullata.");
    }
    throw new Error(message ?? "Impossibile annullare la pre-fattura.");
  }
  return (await response.json()) as Invoice;
}

// Anteprima PDF di una pre-fattura NON ancora generata: POST (la selezione
// viaggia nel body, come generateInvoice) verso una rotta raw Express (non
// tsoa/JSON, stesso motivo di getInvoicePdfBlobUrl sotto), nessuna
// persistenza lato server. Stesso contratto di getInvoicePdfBlobUrl: il
// chiamante è responsabile di revocare l'URL con URL.revokeObjectURL quando
// non serve più.
export async function previewInvoicePdfBlobUrl(
  customerId: string,
  taskSelections: TaskSelection[],
): Promise<string> {
  const response = await authFetch(`${API_BASE_URL}/customers/${customerId}/invoices/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify({ taskSelections }),
  });
  if (!response.ok) {
    const message = await readErrorMessage(response);
    if (response.status === 404) {
      throw new Error(message ?? "Cliente non trovato.");
    }
    if (response.status === 409) {
      throw new Error(message ?? "Un task selezionato non è più fatturabile.");
    }
    if (response.status === 422) {
      throw new Error(
        message ?? "Seleziona almeno un task e verifica che al cliente sia impostata una tariffa.",
      );
    }
    throw new Error(message ?? "Impossibile generare l'anteprima della pre-fattura.");
  }
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

export async function listBillableTasks(customerId: string): Promise<BillableTask[]> {
  const response = await authFetch(
    `${API_BASE_URL}/customers/${customerId}/invoices/billable-tasks`,
    { headers: authHeader() },
  );
  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message ?? "Impossibile caricare i task fatturabili.");
  }
  return (await response.json()) as BillableTask[];
}

export async function listCompanyInvoices(companyId: string): Promise<Invoice[]> {
  const response = await authFetch(`${API_BASE_URL}/companies/${companyId}/invoices`, {
    headers: authHeader(),
  });
  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message ?? "Impossibile caricare le pre-fatture.");
  }
  return (await response.json()) as Invoice[];
}

export async function getInvoice(invoiceId: string): Promise<InvoiceWithItems> {
  const response = await authFetch(`${API_BASE_URL}/invoices/${invoiceId}`, {
    headers: authHeader(),
  });
  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message ?? "Impossibile caricare la pre-fattura.");
  }
  return (await response.json()) as InvoiceWithItems;
}

// GET /invoices/{invoiceId}/pdf non è un endpoint tsoa/JSON ma una rotta
// Express raw che streamma direttamente il binario (vedi backend/src/app.ts):
// stessa autenticazione (authFetch + authHeader) delle altre chiamate, ma il
// corpo va letto come blob, non come JSON.
//
// IMPORTANTE: il chiamante è responsabile di revocare l'URL restituito con
// URL.revokeObjectURL(url) quando non serve più (tipicamente nel cleanup di
// un useEffect), altrimenti il blob resta vivo in memoria per tutta la
// sessione della pagina.
export async function getInvoicePdfBlobUrl(invoiceId: string): Promise<string> {
  const response = await authFetch(`${API_BASE_URL}/invoices/${invoiceId}/pdf`, {
    headers: authHeader(),
  });
  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message ?? "Impossibile caricare il PDF della pre-fattura.");
  }
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}
