-- Tabella clienti (pre-fatturazione, punto 2): anagrafica minima per la
-- futura generazione del PDF di pre-fatturazione (ore lavorate + task per
-- cliente). Stesso pattern di scoping per company_id e cascade delete già
-- usato da projects verso companies (vedi migration 0015).
-- last_invoiced_at resta sola lettura lato applicazione: nessun endpoint la
-- valorizza in questa fase, la scriverà la futura funzionalità di
-- pre-fatturazione.

CREATE TABLE customers (
  id               uuid        NOT NULL DEFAULT gen_random_uuid(),
  company_id       uuid        NOT NULL,
  name             varchar     NOT NULL,
  description      text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_invoiced_at timestamptz,
  CONSTRAINT customers_pk PRIMARY KEY (id),
  CONSTRAINT customers_company_id_fk FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
);

CREATE INDEX customers_company_id_idx ON customers (company_id);
