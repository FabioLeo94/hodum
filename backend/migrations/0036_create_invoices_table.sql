-- create invoices table (pre-fatturazione, punto 3)
-- Testata della pre-fattura: una riga per ogni documento generato, il
-- dettaglio dei task inclusi sta in invoice_items (0037). company_id e
-- customer_id sono NOT NULL senza ON DELETE CASCADE/SET NULL (default
-- RESTRICT): a differenza di projects.customer_id (0035), qui la relazione è
-- integrità storica, non comoda — non deve essere possibile cancellare un
-- cliente o un'azienda che ha già fatture emesse.
-- numero è progressivo per company (non globale): UNIQUE (company_id, numero)
-- riflette la numerazione fiscale, che riparte per ogni azienda.
-- totale_secondi e totale_importo sono uno snapshot aggregato al momento
-- della generazione: non si ricalcolano da invoice_items, così la pre-fattura
-- resta leggibile anche se in futuro cambiasse la logica di aggregazione.
-- pdf_path è il riferimento al file scritto su disco (backend/invoices/,
-- vedi .gitignore) dalla futura funzionalità di generazione PDF.

CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies (id),
  customer_id uuid NOT NULL REFERENCES customers (id),
  numero integer NOT NULL,
  data_generazione timestamptz NOT NULL DEFAULT now(),
  totale_secondi integer NOT NULL,
  totale_importo numeric(12,2) NOT NULL,
  pdf_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, numero)
);

CREATE INDEX invoices_customer_id_idx ON invoices (customer_id);
