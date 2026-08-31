-- create companies table
-- Prima tabella del modello "azienda multi-utente" (.tasks/TASK.md, punto 2):
-- serve come ancora per il futuro users.company_id e projects.company_id.
-- owner_id individua l'utente owner dell'azienda (chi l'ha creata, unico
-- abilitato a gestire i dipendenti — task 5/6, non qui). Non referenzia ancora
-- nessuna colonna su users: users.company_id/role arrivano nella prossima
-- migration di questa stessa sessione (0014).
-- Stesso pattern id già usato da projects/tasks (0005/0006): uuid generato dal
-- database, non dal service.

CREATE TABLE companies (
  id       uuid    NOT NULL DEFAULT gen_random_uuid(),
  name     varchar NOT NULL,
  owner_id uuid    NOT NULL,
  CONSTRAINT companies_pk PRIMARY KEY (id),
  CONSTRAINT companies_owner_id_fk FOREIGN KEY (owner_id) REFERENCES users (id)
);
