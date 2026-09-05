// Forma dell'entità Project esposta dall'API: camelCase lato applicativo.
// Il mapping da/verso la colonna snake_case is_active vive nel service,
// vicino alla query che la produce (un solo campo non giustifica un
// livello di mapping condiviso a parte).
export interface Project {
  id: string;
  name: string;
  isActive: boolean;
  // Cliente a cui il progetto è fatturabile (customers, migration 0035):
  // opzionale per sempre, a differenza di company_id (NOT NULL) non tutti i
  // progetti sono legati a un cliente specifico.
  customerId: string | null;
}
