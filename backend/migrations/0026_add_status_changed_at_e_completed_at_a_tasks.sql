-- add status_changed_at e completed_at a tasks
-- L'assistente AI deve rispondere a query aggregate ("task fermi da troppo
-- tempo", "trend dei completamenti") ma tasks traccia solo lo stato attuale,
-- non quando è cambiato: senza questo dato non c'è modo di distinguere un
-- task fermo da mesi da uno appena entrato in quello stato.
--
-- status_changed_at: NOT NULL DEFAULT now() perché da qui in avanti ogni riga
-- ha sempre un valore (il codice applicativo lo aggiornerà ad ogni cambio di
-- stato reale, task separato, non in questa migration). Sulle righe esistenti
-- non esiste uno storico dei cambi di stato: viene approssimato con
-- creation_date, il segnale più vicino disponibile, con lo UPDATE qui sotto.
--
-- completed_at: resta NULL su tutte le righe esistenti, inclusi i task già in
-- stato "completed". Indovinarlo da creation_date produrrebbe un trend dei
-- completamenti falsato (mostrerebbe come "completato alla creazione" un
-- task magari chiuso mesi dopo). Il trend parte quindi da zero dati storici
-- e si popola da questo momento in poi via codice applicativo.

ALTER TABLE tasks
  ADD COLUMN status_changed_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE tasks
  ADD COLUMN completed_at timestamptz;

UPDATE tasks SET status_changed_at = COALESCE(creation_date, now());
