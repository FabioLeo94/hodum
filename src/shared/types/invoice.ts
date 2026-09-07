// Forme dell'entità Invoice/InvoiceItem esposte dall'API: camelCase lato
// applicativo, identiche a backend/src/models/invoice.ts e invoiceItem.ts
// (vedi i commenti lì per la semantica di ogni campo, es. perché
// totaleSecondi/totaleImporto sono uno snapshot e non si ricalcolano da
// invoice_items).
export interface Invoice {
  id: string;
  companyId: string;
  customerId: string;
  numero: number;
  dataGenerazione: string;
  totaleSecondi: number;
  totaleImporto: number;
  // Annullamento (vedi backend/migrations/0042): null finché la pre-fattura è
  // attiva. Un annullamento non elimina l'invoice né libera `numero`, resta
  // nello storico in sola lettura.
  cancelledAt: string | null;
}

export interface InvoiceItem {
  id: string;
  invoiceId: string;
  taskId: string;
  taskTitle: string;
  projectId: string;
  secondiFatturati: number;
  tariffaOrariaSnapshot: number;
  nonFatturabile: boolean;
}

// GET /invoices/{invoiceId}: la testata e le sue righe di dettaglio insieme,
// stessa forma restituita dal backend (vedi invoiceController.ts).
export interface InvoiceWithItems {
  invoice: Invoice;
  items: InvoiceItem[];
}

// GET /customers/{customerId}/invoices/billable-tasks: i task del cliente
// ancora fatturabili (completed/rejected, tempo accumulato > 0, non ancora
// fatturati), la lista che generateInvoiceDrawerComponent mostra per la
// selezione. projectId/projectName seguono lo stesso motivo di
// TaskWithProject in shared/types/project.ts: qui i task vengono da più
// progetti dello stesso cliente, serve etichettarli.
export interface BillableTask {
  id: string;
  title: string;
  workAccumulatedSeconds: number;
  projectId: string;
  projectName: string;
}
