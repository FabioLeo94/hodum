// Forma dell'entità Invoice (testata di una pre-fattura) esposta dall'API:
// camelCase lato applicativo, coerente con customer.ts/task.ts (vedi
// migrations/0036_create_invoices_table.sql). pdf_path NON è incluso qui
// apposta: è un path filesystem lato server (backend/invoices/), non deve mai
// comparire in una response REST — resta interno a invoiceService, che lo usa
// solo per risolvere il file da streammare via GET invoices/{id}/pdf.
export interface Invoice {
  id: string;
  companyId: string;
  customerId: string;
  // Progressivo per company (non globale), vedi UNIQUE(company_id, numero)
  // in 0036: riflette la numerazione fiscale, che riparte per ogni azienda.
  numero: number;
  dataGenerazione: string;
  // Snapshot aggregato al momento della generazione: non si ricalcola da
  // invoice_items, coerente con il commento sulla colonna in 0036.
  totaleSecondi: number;
  totaleImporto: number;
  // Annullamento (migration 0042): null finché la pre-fattura è attiva. Un
  // annullamento non elimina la riga né libera `numero` (vedi commento nella
  // migration): resta nello storico, sola lettura, i task coinvolti tornano
  // fatturabili (invoiceService.cancelInvoice).
  cancelledAt: string | null;
}
