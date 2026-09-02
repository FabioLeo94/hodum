-- create notifications table
-- Nuova feature "notifiche in-app": una riga per destinatario per evento
-- (task_comment | task_created | task_due | project_assigned), letta con
-- JOIN su projects/tasks/users per denormalizzare titoli/nomi in UI e
-- filtrata quasi sempre per user_id singolo (pattern confermato: nessuna
-- vista elenca notifiche per company o per progetto, solo "le mie notifiche").
-- Stesso pattern id già usato da companies/projects/tasks/users/task_comments
-- (0005/0006/0009/0013/0020): uuid generato dal database con
-- gen_random_uuid(), non dal service.
--
-- type: varchar senza lunghezza (convenzione stabilita in 0011, non
-- varchar(n) arbitrario) con CHECK sui 4 valori applicativi noti, stesso
-- pattern già in uso per users.role (0014/0017): il set è chiuso e deciso dal
-- codice, non editabile da un utente finale, quindi non giustifica una tabella
-- di lookup come task_status (quella cresce/si modifica da UI amministrativa).
-- Senza il CHECK, una riga con type = 'tsak_due' (typo) o un valore fuori
-- dall'enum applicativo entrerebbe silenziosamente e romperebbe il rendering
-- lato frontend senza che il database se ne accorga.
--
-- project_id/task_id/comment_id: tutti NULL perché non ogni notifica si
-- riferisce a tutte e tre le entità (project_assigned non ha un task né un
-- commento, task_created non ha un commento). ON DELETE CASCADE su tutte:
-- una notifica che punta a un progetto/task/commento ormai cancellato non ha
-- più senso da mostrare (stessa logica già applicata a tasks->projects in
-- 0007 e task_comments->tasks in 0020), a differenza di users.company_id in
-- 0014 dove l'orfanaggio doveva fallire esplicitamente: qui non c'è nessun
-- vincolo di integrità di dominio da proteggere, solo notifiche che perdono
-- significato.
--
-- actor_id: ON DELETE SET NULL (non CASCADE) perché la notifica in sé resta
-- valida anche se chi ha generato l'evento viene eliminato dopo (es. "un
-- commento è stato aggiunto" resta vero anche se l'autore del commento non
-- esiste più); NULL è anche lo stato normale per il job di scadenza che non
-- ha un attore umano. Nessun indice: nessuna query elenca le notifiche
-- generate da un attore specifico oggi, stessa decisione già presa per
-- task_comments.author_id in 0020 (da rivalutare se emerge quella query).
-- Stesso ragionamento per company_id: NOT NULL come confine multi-tenant
-- sempre presente (a differenza di project_id/task_id, che possono mancare a
-- seconda del type), ma senza indice dedicato perché l'isolamento per utente
-- passa già da user_id, non da company_id, in ogni query nota oggi.
--
-- due_date: date (non timestamptz) per coerenza con tasks.due_date (0022),
-- di cui è semplicemente una copia al momento della generazione della
-- notifica di scadenza; nullable perché ha senso solo per type = 'task_due'.
--
-- read: boolean NOT NULL DEFAULT false, stesso pattern già usato per
-- must_change_password (0016) ed edited (0021): ogni notifica nuova parte
-- "da leggere" finché un'azione esplicita dell'utente la marca letta.
--
-- created_at: NOT NULL DEFAULT now(), stesso pattern di tasks.creation_date
-- (0011) e task_comments.created_at (0020).
--
-- Indice notifications_user_id_created_at_idx (user_id, created_at DESC):
-- copre l'unico pattern di lettura noto, "notifiche di un utente ordinate
-- dalla più recente" (WHERE user_id = $1 ORDER BY created_at DESC), sia per
-- il filtro sia per l'ORDER BY, evitando un Sort separato.
--
-- Indice unico parziale notifications_task_due_dedup_idx (user_id, task_id,
-- due_date) WHERE type = 'task_due': evita di rispedire lo stesso promemoria
-- di scadenza ogni volta che il job periodico gira, un solo 'task_due' per
-- utente/task/scadenza specifica. Parziale perché due_date ha senso solo per
-- questo type: un indice non parziale includerebbe righe con due_date NULL
-- per tutti gli altri type, dove l'unicità (user_id, task_id, NULL) non
-- avrebbe significato (e NULL in un indice unico comunque non si
-- deduplicherebbe da solo, essendo NULL <> NULL).
--
-- project_id/task_id/comment_id: indicizzate nonostante nessuna query
-- applicativa filtri per queste colonne oggi (a differenza di
-- task_comments.author_id in 0020, qui la ragione non è una query ma il
-- DELETE CASCADE): DELETE FROM projects/tasks/task_comments è un'operazione
-- applicativa ordinaria (un utente cancella un task o un progetto), non rara
-- come DELETE FROM users, e a ogni cancellazione Postgres deve verificare
-- questa FK scansionando notifications per righe da cascatare. notifications
-- è la tabella con la crescita più rapida dello schema (una riga per
-- destinatario per evento, non una per evento), quindi è quella con più da
-- perdere da un Seq Scan a ogni DELETE su project/task/comment. Costo
-- accettato: tre indici B-tree in più da mantenere a ogni INSERT (compreso
-- l'INSERT ... SELECT ... FROM unnest bulk), a fronte di evitare uno scan
-- sull'intera tabella a ogni cancellazione.
--
-- Tabella nuova e vuota: CREATE INDEX diretto (non CONCURRENTLY) non ha righe
-- da scansionare e il lock ACCESS EXCLUSIVE è istantaneo.

CREATE TABLE notifications (
  id             uuid        NOT NULL DEFAULT gen_random_uuid(),
  user_id        uuid        NOT NULL,
  company_id     uuid        NOT NULL,
  type           varchar     NOT NULL,
  project_id     uuid        NULL,
  task_id        uuid        NULL,
  comment_id     uuid        NULL,
  actor_id       uuid        NULL,
  due_date       date        NULL,
  read           boolean     NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notifications_pk PRIMARY KEY (id),
  CONSTRAINT notifications_type_check CHECK (type IN ('task_comment', 'task_created', 'task_due', 'project_assigned')),
  CONSTRAINT notifications_user_id_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT notifications_company_id_fk FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
  CONSTRAINT notifications_project_id_fk FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
  CONSTRAINT notifications_task_id_fk FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE,
  CONSTRAINT notifications_comment_id_fk FOREIGN KEY (comment_id) REFERENCES task_comments (id) ON DELETE CASCADE,
  CONSTRAINT notifications_actor_id_fk FOREIGN KEY (actor_id) REFERENCES users (id) ON DELETE SET NULL
);

CREATE INDEX notifications_user_id_created_at_idx ON notifications (user_id, created_at DESC);

CREATE INDEX notifications_project_id_idx ON notifications (project_id);
CREATE INDEX notifications_task_id_idx ON notifications (task_id);
CREATE INDEX notifications_comment_id_idx ON notifications (comment_id);

-- Evita di rispedire lo stesso promemoria di scadenza ogni ora finché un job
-- periodico gira: un solo 'task_due' per utente/task/scadenza specifica.
-- Indice parziale perché la colonna ha senso solo per questo type.
CREATE UNIQUE INDEX notifications_task_due_dedup_idx
  ON notifications (user_id, task_id, due_date)
  WHERE type = 'task_due';
