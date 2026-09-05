import type { RateUnit } from './company';

// Forma dell'entità Customer esposta dall'API: camelCase lato applicativo,
// coerente con company.ts/task.ts (vedi migrations/0032_create_customers_table.sql).
export interface Customer {
  id: string;
  companyId: string;
  name: string;
  description: string | null;
  createdAt: string;
  // Sola lettura in questa fase: nessun endpoint la valorizza, resterà
  // sempre null finché la futura funzionalità di pre-fatturazione non la
  // scrive direttamente sul DB.
  lastInvoicedAt: string | null;
  // Opzionale per sempre (0034): se null, la futura pre-fatturazione userà la
  // tariffa della company di appartenenza. Stessa accoppiata canonica di
  // Company.tariffaOraria/tariffaUnita: nessun cliente ha giorni/orari propri,
  // per le conversioni di unità si riusano quelli della company (vedi
  // migrations/0034_add_tariffa_a_customers.sql).
  tariffaOraria: number | null;
  tariffaUnita: RateUnit | null;
}
