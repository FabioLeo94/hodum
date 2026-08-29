-- task status name unique
-- task_status.name (baseline 0002, poi ricreata smallint/identity in 0004) non
-- ha mai avuto un vincolo di unicità. taskService.updateTaskStatus risolve lo
-- slug ricevuto dal client con "SELECT id FROM task_status WHERE name = $3"
-- dentro una UPDATE: se in task_status finissero due righe con lo stesso name
-- (seed duplicato a mano, insert manuale in console) quella subquery
-- restituirebbe più di una riga e l'UPDATE fallirebbe a runtime con "more
-- than one row returned by a subquery used as an expression" invece di un
-- 404/409 gestito. Il vincolo chiude la lacuna alla fonte.
-- Verificato prima di scrivere questa migration: task_status ha 4 righe
-- (seed di 0004), nomi tutti distinti ('in progress', 'review', 'completed',
-- 'rejected'), quindi ADD CONSTRAINT diretto senza NOT VALID: la scansione di
-- validazione su 4 righe è istantanea.

ALTER TABLE task_status
  ADD CONSTRAINT task_status_name_unique UNIQUE (name);
