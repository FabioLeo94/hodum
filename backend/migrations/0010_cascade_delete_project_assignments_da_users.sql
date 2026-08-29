-- cascade delete project_assignments da users
-- Lacuna lasciata aperta di proposito in
-- 0007_cascade_delete_tasks_e_project_assignments_da_projects.sql:
-- project_assignments_users_fk (baseline, 0002) non specifica ON DELETE, quindi
-- Postgres usa NO ACTION. userService.deleteUser fallisce con 23503 non appena
-- l'utente ha almeno un'assegnazione in project_assignments. All'epoca la
-- scelta CASCADE vs RESTRICT non era ovvia (rischio di perdere silenziosamente
-- la storia di chi era assegnato a un progetto).
--
-- Decisione di prodotto ora presa: non serve preservare questa storia al
-- momento dell'eliminazione dell'utente; un'eventuale tabella di log/audit
-- dedicata arriverà più avanti e non è competenza di questa FK. Un'assegnazione
-- non ha senso senza l'utente a cui si riferisce: stessa logica già applicata
-- alle altre due FK in 0007, ON DELETE CASCADE anche qui.
--
-- Postgres non supporta ALTER CONSTRAINT per cambiare ON DELETE su una FK
-- esistente: serve DROP + ADD, come in 0007. project_assignments ha già un
-- indice su user_id (project_assignments_user_id_idx, da 0003) che copre lo
-- scan di validazione della nuova FK e il controllo di integrità sui DELETE da
-- users: nessun indice aggiuntivo da creare qui.

ALTER TABLE project_assignments
  DROP CONSTRAINT project_assignments_users_fk;

ALTER TABLE project_assignments
  ADD CONSTRAINT project_assignments_users_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
