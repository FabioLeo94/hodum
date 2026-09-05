-- add customer id a projects
-- Permette di collegare un progetto a un cliente (customers, 0032): opzionale
-- (nullable) perché non tutti i progetti sono fatturabili a un cliente
-- specifico, a differenza di company_id su projects che è NOT NULL. ON DELETE
-- SET NULL invece di CASCADE: eliminare un cliente non deve portarsi via i
-- progetti collegati, solo scollegarli (stesso principio di
-- project_assignments -> users in 0010, ma qui l'entità "genitore" opzionale
-- non deve propagare la cancellazione).

ALTER TABLE projects
  ADD COLUMN customer_id uuid REFERENCES customers (id) ON DELETE SET NULL;

CREATE INDEX projects_customer_id_idx ON projects (customer_id);
