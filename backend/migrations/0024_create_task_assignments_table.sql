-- create task_assignments table
-- Nuova feature "assegnazione task a dipendenti": relazione many-to-many
-- tra tasks e users, separata da project_assignments (assegnazione a livello
-- di progetto) che questa migration non tocca.
-- task_id/user_id + PK composita (task_id, user_id): stesso pattern di
-- project_assignments (0003), impedisce assegnazioni duplicate della stessa
-- coppia (task_id, user_id) e copre, per leftmost-prefix, il pattern
-- "assegnatari di un task" (WHERE task_id = ...).
-- Indice dedicato su user_id: la PK non copre il pattern "task di un utente"
-- (WHERE user_id = ...), perché user_id non è la colonna più a sinistra;
-- stesso motivo di project_assignments_user_id_idx (0003).
-- CASCADE su entrambe le FK fin dall'origine, non serve un DROP+ADD
-- successivo come si è dovuto fare per project_assignments in 0010: qui la
-- tabella nasce già con la decisione di prodotto presa, un'assegnazione non
-- ha senso senza il task o l'utente a cui si riferisce.
-- created_at: stesso pattern di task_comments.created_at (0020), sola
-- tracciabilità, non letto da nessuna query applicativa oggi.
-- Tabella nuova e vuota: CREATE INDEX diretto (non CONCURRENTLY) non ha
-- righe da scansionare e il lock ACCESS EXCLUSIVE è istantaneo.

CREATE TABLE task_assignments (
  task_id    uuid        NOT NULL,
  user_id    uuid        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_assignments_pk PRIMARY KEY (task_id, user_id),
  CONSTRAINT task_assignments_task_id_fk FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE,
  CONSTRAINT task_assignments_user_id_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX task_assignments_user_id_idx ON task_assignments (user_id);
