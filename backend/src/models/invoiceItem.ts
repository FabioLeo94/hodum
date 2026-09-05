// Forma dell'entità InvoiceItem (riga di dettaglio di una pre-fattura)
// esposta dall'API: camelCase lato applicativo, coerente con invoice.ts (vedi
// migrations/0037_create_invoice_items_table.sql). taskTitle è denormalizzato
// via JOIN su tasks in invoiceService (comodo per la UI/il PDF, evita una
// query separata per riga).
export interface InvoiceItem {
  id: string;
  invoiceId: string;
  taskId: string;
  taskTitle: string;
  projectId: string;
  secondiFatturati: number;
  // Tariffa congelata al momento della fatturazione (cliente o azienda, la
  // risoluzione vive nel service): resta quella vera anche per le righe
  // nonFatturabile, che azzerano solo l'importo calcolato, non lo snapshot
  // (coerenza contabile, vedi commento su non_fatturabile in 0037).
  tariffaOrariaSnapshot: number;
  nonFatturabile: boolean;
}
