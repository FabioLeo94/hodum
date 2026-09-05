-- Timer di lavorazione per task (pre-fatturazione, punto 1)
-- Tre colonne invece di un enum di stato esplicito: lo stato del timer
-- (idle/in esecuzione/in pausa/terminato) è sempre derivabile da questi tre
-- valori, senza rischio che uno stato salvato a parte vada fuori sincrono con
-- i timestamp che lo dovrebbero motivare.
-- work_started_at: non-null solo mentre il timer sta girando (l'ultimo
-- "Play"/ripresa). Azzerato da pausa, termina lavorazione o reset.
-- work_accumulated_seconds: somma dei segmenti già chiusi da una pausa o da
-- un "termina lavorazione" precedenti. Azzerato solo dal reset.
-- work_ended_at: timestamp dell'ultima "terminazione" (manuale via bottone, o
-- automatica quando il task passa a completed/rejected, vedi taskService.ts
-- updateTaskStatus). Azzerato solo dal reset; NON viene ripristinato a NULL
-- riportando il task in progress/review, per scelta esplicita dell'utente
-- (il timer resta congelato finché non si preme di nuovo Play).

ALTER TABLE tasks
  ADD COLUMN work_started_at timestamptz NULL,
  ADD COLUMN work_accumulated_seconds integer NOT NULL DEFAULT 0,
  ADD COLUMN work_ended_at timestamptz NULL;

ALTER TABLE tasks
  ADD CONSTRAINT tasks_work_accumulated_seconds_check CHECK (work_accumulated_seconds >= 0);
