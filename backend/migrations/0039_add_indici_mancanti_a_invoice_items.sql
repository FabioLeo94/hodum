-- add indici mancanti a invoice_items (0037)
-- Le due FK invoice_id (ON DELETE CASCADE) e project_id (RESTRICT di default)
-- erano senza indice sulla colonna referenziante: ogni DELETE su invoices
-- (cascata) o su projects (verifica RESTRICT) avrebbe fatto un seq scan su
-- invoice_items per trovare le righe collegate. Tabella ancora vuota in
-- questa fase del progetto, quindi CREATE INDEX normale (non CONCURRENTLY)
-- è sufficiente: nessun lock prolungato da evitare.

CREATE INDEX invoice_items_invoice_id_idx ON invoice_items (invoice_id);
CREATE INDEX invoice_items_project_id_idx ON invoice_items (project_id);
