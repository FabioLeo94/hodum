-- add due date a tasks
-- Il task manager non ha mai avuto un campo data di scadenza sui task
-- (assenza notevole segnalata in .tasks/TASK.md): serve per la nuova vista
-- Calendario e per segnalare i task in scadenza/in ritardo.
--
-- A differenza di tasks.priority (migration 0012), qui NULL non è un
-- placeholder temporaneo da colmare ma uno stato di dominio legittimo e
-- permanente ("nessuna scadenza impostata"): niente NOT NULL, niente
-- DEFAULT. Nessun CHECK: qualunque data valida del tipo `date` è ammessa,
-- la validazione di formato resta lato controller (stesso schema di
-- priority/status, vedi taskService.isValidDueDate).
--
-- Verificato prima di scrivere questa migration: tasks ha 9 righe, tutte
-- prive di scadenza. ADD COLUMN senza DEFAULT le popola con NULL, che è
-- esattamente il comportamento voluto (nessuna resta "in scadenza"/"in
-- ritardo" finché qualcuno non imposta una data esplicita).

ALTER TABLE tasks
  ADD COLUMN due_date date;
