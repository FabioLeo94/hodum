-- task status name varchar e tasks creation date timestamptz
-- Due incoerenze segnalate in .tasks/TASK.md (audit DB):
--
-- 1) task_status.name è varchar(25) (baseline 0002, ricreata in 0004) mentre
--    tutte le altre colonne testuali del progetto (users.username/email/
--    password, projects.name, tasks.title/description) sono varchar senza
--    lunghezza. In Postgres varchar(n) non ha alcun vantaggio di performance
--    su varchar semplice: si toglie il limite per uniformare la colonna alla
--    convenzione del resto dello schema, invece di estendere il limite alle
--    altre.
--
-- 2) tasks.creation_date è date (niente ora/fuso orario): non permette di
--    ordinare/filtrare i task per momento esatto di creazione. Si passa a
--    timestamptz con DEFAULT now(). Questo risolve anche un bug collegato:
--    taskService.createTask (taskService.ts) non valorizza mai questa
--    colonna nell'INSERT, quindi oggi è sempre NULL e l'ORDER BY
--    t.creation_date in listTasksByProject è di fatto inerte. Con il
--    DEFAULT, il valore viene popolato dal DB senza toccare il codice
--    applicativo, stesso pattern già usato per tasks.status (vedi commento
--    in taskService.ts:102-103 e il DEFAULT impostato in migration 0004).
--
-- Verificato prima di scrivere questa migration: task_status ha 4 righe con
-- nomi brevi ('in progress', 'review', 'completed', 'rejected'), nessuno
-- vicino al limite di 25 caratteri; tasks ha 0 righe con creation_date
-- valorizzato (sempre NULL), quindi il cast DATE -> TIMESTAMPTZ non ha dati
-- da convertire e non rischia di introdurre valori con un'ora arbitraria.

ALTER TABLE task_status
  ALTER COLUMN name TYPE varchar;

ALTER TABLE tasks
  ALTER COLUMN creation_date TYPE timestamptz USING creation_date::timestamptz;

ALTER TABLE tasks
  ALTER COLUMN creation_date SET DEFAULT now();
