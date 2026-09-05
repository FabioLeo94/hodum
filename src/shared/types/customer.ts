import type { RateUnit } from "../utils/rateConversion";

// Forma dell'entità Customer esposta dall'API: camelCase lato applicativo,
// coerente con project.ts/task.ts (vedi backend/src/models/customer.ts e
// migrations/0032_create_customers_table.sql).
export interface Customer {
  id: string;
  companyId: string;
  name: string;
  description: string | null;
  createdAt: string;
  // Sola lettura in questa fase: nessun endpoint la valorizza, la scriverà
  // la futura funzionalità di generazione PDF di pre-fatturazione.
  lastInvoicedAt: string | null;
  // Opzionale per sempre: se null, la futura pre-fatturazione userà la
  // tariffa della company di appartenenza. Nessun cliente ha giorni/orari
  // propri: le conversioni di unità riusano sempre quelli della company
  // (vedi backend/src/models/customer.ts).
  tariffaOraria: number | null;
  tariffaUnita: RateUnit | null;
}
