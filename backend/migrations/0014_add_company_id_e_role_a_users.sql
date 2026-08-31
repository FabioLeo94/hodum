-- add company id e role a users
-- .tasks/TASK.md punto 2: ogni utente appartiene a un'azienda con un ruolo
-- (owner | employee). Entrambe le colonne restano NULLABLE per ora: gli
-- utenti esistenti (3 righe, verificate prima di scrivere questa migration)
-- non hanno ancora un'azienda da assegnare — i task 5/6 (registrazione crea
-- azienda + owner, owner crea dipendenti) sono quelli che valorizzeranno
-- queste colonne per gli utenti nuovi. Forzare qui un default arbitrario
-- (es. role = 'employee' per righe senza company_id) non avrebbe significato
-- di dominio: un ruolo esiste solo in relazione a un'azienda.
-- company_id NON ha ON DELETE CASCADE: eliminare un'azienda con dipendenti
-- ancora agganciati deve fallire in modo esplicito (23503), non orfanizzare
-- silenziosamente gli utenti — stessa logica prudente già vista per
-- project_assignments_users_fk prima che venisse deciso CASCADE (0010).

ALTER TABLE users
  ADD COLUMN company_id uuid REFERENCES companies (id),
  ADD COLUMN role varchar(20) CONSTRAINT users_role_check CHECK (role IN ('owner', 'employee'));
