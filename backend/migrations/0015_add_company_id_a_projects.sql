-- add company id a projects
-- .tasks/TASK.md punto 3: ogni progetto appartiene a un'azienda, NOT NULL
-- (a differenza di users.company_id in 0014) perché un progetto senza azienda
-- non ha senso di dominio una volta introdotto l'isolamento multi-azienda.
-- Backfill: verificato con l'utente prima di scrivere questa migration. I 4
-- progetti esistenti sono dati di sviluppo, non c'è ancora nessun utente con
-- un'azienda assegnata (0014 lascia company_id nullable) a cui agganciarli, e
-- l'utente ha confermato di poterli azzerare invece di inventare un'azienda
-- "storica" placeholder. DELETE FROM projects cascata su tasks e
-- project_assignments grazie alle FK ON DELETE CASCADE già impostate in
-- 0007_cascade_delete_tasks_e_project_assignments_da_projects.sql, quindi non
-- serve TRUNCATE CASCADE. Con la tabella vuota, ADD COLUMN ... NOT NULL non
-- richiede un DEFAULT né il pattern NOT VALID + VALIDATE in due passi (0003).

DELETE FROM projects;

ALTER TABLE projects
  ADD COLUMN company_id uuid NOT NULL REFERENCES companies (id);

CREATE INDEX projects_company_id_idx ON projects (company_id);
