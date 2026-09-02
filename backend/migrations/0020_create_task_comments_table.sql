-- create task_comments table
-- Nuova feature "commenti sul task": cronologia dei commenti lasciati dagli
-- utenti su un task, separata da tasks.description (campo unico, non uno
-- storico) che questa migration non tocca.
-- Stesso pattern id già usato da companies/projects/tasks/users
-- (0005/0006/0009/0013): uuid generato dal database con gen_random_uuid(),
-- non dal service, fin dall'origine.
-- task_id: ON DELETE CASCADE, stessa logica già applicata a tasks->projects
-- in 0007 ("un task non ha senso senza il suo progetto"), qui un commento non
-- ha senso senza il task a cui si riferisce.
-- author_id: ON DELETE CASCADE applicata fin dall'origine invece che con un
-- DROP+ADD successivo come per project_assignments_users_fk in 0010, stessa
-- decisione di prodotto già presa lì ("non serve preservare questa storia al
-- momento dell'eliminazione dell'utente").
-- body: varchar senza lunghezza, stessa convenzione delle altre colonne
-- testuali del progetto (vedi commento in 0011).
-- created_at: NOT NULL DEFAULT now(), stesso pattern di tasks.creation_date
-- (0011) e users.created_at (0019): ogni commento, passato o futuro, ha
-- sempre un momento di creazione, valorizzato dal DB senza bisogno che il
-- service lo passi esplicitamente.
-- Indice su task_id: le query applicative filtrano sempre per un singolo
-- task ("WHERE task_id = $1 ORDER BY created_at"), mai su tutta la tabella;
-- copre anche lo scan di validazione della FK sui DELETE da tasks. Nessun
-- indice su author_id: nessuna query oggi elenca i commenti per autore, e il
-- DELETE da users passa già per l'indice implicito della PK di task_comments
-- solo se necessario in futuro (da rivalutare se emerge quella query).
-- Tabella nuova e vuota: CREATE INDEX diretto (non CONCURRENTLY) non ha
-- righe da scansionare e il lock ACCESS EXCLUSIVE è istantaneo.

CREATE TABLE task_comments (
  id         uuid        NOT NULL DEFAULT gen_random_uuid(),
  task_id    uuid        NOT NULL,
  author_id  uuid        NOT NULL,
  body       varchar     NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_comments_pk PRIMARY KEY (id),
  CONSTRAINT task_comments_task_id_fk FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE,
  CONSTRAINT task_comments_author_id_fk FOREIGN KEY (author_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX task_comments_task_id_idx ON task_comments (task_id);
