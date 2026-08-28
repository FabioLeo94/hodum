-- fix fk tasks project_id e pk project_assignments
-- Corregge due lacune dello schema baseline (vedi commento in
-- 0002_baseline_schema_esistente.sql): tasks.project_id senza FK verso
-- projects, project_assignments senza PRIMARY KEY/indici sulle colonne di FK.
-- Verificato prima di scrivere questa migration: tasks e project_assignments
-- sono entrambe vuote (0 righe), quindi nessun project_id orfano in tasks e
-- nessun duplicato (project_id, user_id) in project_assignments da ripulire.
-- Per questo gli ALTER sono diretti, senza il pattern NOT VALID + VALIDATE
-- in due passi (necessario solo su tabelle già popolate).

ALTER TABLE tasks
  ADD CONSTRAINT tasks_project_id_fk FOREIGN KEY (project_id) REFERENCES projects (id);

-- Postgres non crea automaticamente un indice sulla colonna referenziante di
-- una FK: senza questo, ogni DELETE su projects fa un seq scan su tasks per
-- il controllo di integrità, e le query "task di un progetto" non avrebbero
-- un indice da usare.
CREATE INDEX tasks_project_id_idx ON tasks (project_id);

-- Chiave primaria composita: impedisce assegnazioni duplicate della stessa
-- coppia (project_id, user_id) e copre, per leftmost-prefix, il pattern
-- "membri di un progetto" (WHERE project_id = ...).
ALTER TABLE project_assignments
  ADD CONSTRAINT project_assignments_pk PRIMARY KEY (project_id, user_id);

-- La PK sopra non copre il pattern "progetti di un utente" (WHERE user_id =
-- ...), perché user_id non è la colonna più a sinistra: serve un indice
-- dedicato, altrimenti quella query farebbe un seq scan su project_assignments.
CREATE INDEX project_assignments_user_id_idx ON project_assignments (user_id);
