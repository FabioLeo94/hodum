-- add invoice id a tasks (pre-fatturazione, punto 3)
-- Campo denormalizzato rispetto a invoice_items.task_id (0037): evita un
-- join su ogni fetch della kanban board, che deve sapere se un task è
-- lockato ad ogni render/aggiornamento realtime. Scritto una sola volta al
-- momento della fatturazione, mai più riaggiornato dopo (coerente con la
-- regola "nessuna sfattura" di invoice_items). Nullable perché la stragrande
-- maggioranza dei task non è mai stata fatturata. ADD COLUMN senza default
-- volatile: metadata-only, nessuna riscrittura della tabella.

ALTER TABLE tasks ADD COLUMN invoice_id uuid NULL REFERENCES invoices (id);

CREATE INDEX tasks_invoice_id_idx ON tasks (invoice_id);
