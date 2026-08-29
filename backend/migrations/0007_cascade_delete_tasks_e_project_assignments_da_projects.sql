-- cascade delete tasks e project_assignments da projects
-- Bug segnalato: DELETE su projects fallisce con 23503 (tasks_project_id_fk)
-- non appena il progetto ha almeno un task, perché la FK aggiunta in
-- 0003_fix_fk_tasks_project_id_e_pk_project_assignments.sql non specifica
-- ON DELETE e Postgres usa NO ACTION di default. Stessa lacuna, stesso
-- effetto, su project_assignments_projects_fk (baseline, 0002): eliminare un
-- progetto con membri assegnati fallirebbe comunque dopo aver risolto solo
-- tasks. Un task non ha senso senza il suo progetto e un'assegnazione non ha
-- senso senza il progetto a cui si riferisce: per entrambe le FK la strategia
-- corretta è ON DELETE CASCADE, non SET NULL (lascerebbe righe orfane
-- semanticamente prive di significato) né RESTRICT (il comportamento attuale,
-- che è esattamente il bug).
--
-- project_assignments_users_fk (project_assignments.user_id -> users.id) NON
-- viene toccata qui: userService.deleteUser ha lo stesso identico problema
-- (fallisce con 23503 se l'utente ha assegnazioni), ma non è il bug segnalato
-- e la scelta lì non è ovvia allo stesso modo: CASCADE cancella silenziosamente
-- la storia di chi era assegnato a un progetto quando l'utente viene rimosso,
-- il che potrebbe non essere accettabile per un requisito di audit trail.
-- Decisione da prendere dal team prima di scrivere quella migration.
--
-- Postgres non supporta ALTER CONSTRAINT per cambiare ON DELETE su una FK
-- esistente: serve DROP + ADD. Verificato prima di scrivere questa migration:
-- tasks ha 2 righe, project_assignments ne ha 0, quindi la scansione di
-- validazione della nuova FK è istantanea e il lock che DROP/ADD CONSTRAINT
-- prendono sulle tabelle (blocca le scritture concorrenti per la durata
-- dell'operazione) è trascurabile in questo ambiente. Su una tabella grande
-- popolata converrebbe ADD CONSTRAINT ... NOT VALID + VALIDATE CONSTRAINT in
-- due passi (stesso pattern già in uso in questo progetto per i NOT NULL)
-- per non bloccare le scritture durante lo scan; non serve qui.

ALTER TABLE tasks
  DROP CONSTRAINT tasks_project_id_fk;

ALTER TABLE tasks
  ADD CONSTRAINT tasks_project_id_fk FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE;

ALTER TABLE project_assignments
  DROP CONSTRAINT project_assignments_projects_fk;

ALTER TABLE project_assignments
  ADD CONSTRAINT project_assignments_projects_fk FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE;
