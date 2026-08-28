-- task_status smallint identity e seed stati assegnabili
-- Terzo problema della baseline (vedi commento in 0002): task_status.id e
-- tasks.status erano bit(1), un tipo che ammette solo 2 valori mentre
-- task_status deve contenere una lista fissa di stati assegnabili ai task.
-- Verificato prima di scrivere questa migration: task_status e tasks hanno
-- entrambe 0 righe (nessun id bit(1) residuo, nessun tasks.status
-- valorizzato). Non c'è quindi nessun dato da rimappare: si droppa e si
-- ricrea invece di tentare un ALTER COLUMN ... TYPE, che comunque
-- rifiuterebbe un cast diretto da bit a smallint.

-- La FK deve sparire prima di poter droppare task_status.
ALTER TABLE tasks
  DROP CONSTRAINT tasks_task_status_fk;

DROP TABLE task_status;

CREATE TABLE task_status (
  id   smallint    GENERATED ALWAYS AS IDENTITY,
  name varchar(25) NOT NULL,
  CONSTRAINT task_status_pk PRIMARY KEY (id)
);

-- tasks è vuota: si droppa e riaggiunge la colonna invece di un ALTER
-- COLUMN ... TYPE (che comunque non converte bit in smallint da sola), senza
-- il pattern NOT VALID + VALIDATE in due passi (necessario solo su tabelle
-- già popolate, vedi 0003).
ALTER TABLE tasks
  DROP COLUMN status;

ALTER TABLE tasks
  ADD COLUMN status smallint;

-- Seed dei 4 stati assegnabili, in quest'ordine: l'IDENTITY parte da 1 e
-- incrementa di 1, quindi l'ordine di inserimento determina gli id (1=in
-- progress, 2=review, 3=completed, 4=rejected). Il DEFAULT di tasks.status
-- viene impostato a partire dall'id restituito dall'insert di 'in progress'
-- invece di scrivere una costante a mano, per non dipendere silenziosamente
-- da quell'ordine se in futuro qualcuno lo cambia senza aggiornare il default.
DO $$
DECLARE
  in_progress_id smallint;
BEGIN
  INSERT INTO task_status (name) VALUES ('in progress') RETURNING id INTO in_progress_id;
  INSERT INTO task_status (name) VALUES ('review'), ('completed'), ('rejected');

  EXECUTE format('ALTER TABLE tasks ALTER COLUMN status SET DEFAULT %L::smallint', in_progress_id);
END $$;

-- NOT NULL diretto (non il pattern in due passi): tasks è vuota, quindi
-- nessuna riga esistente può violare il vincolo e non c'è scan da evitare.
ALTER TABLE tasks
  ALTER COLUMN status SET NOT NULL;

ALTER TABLE tasks
  ADD CONSTRAINT tasks_task_status_fk FOREIGN KEY (status) REFERENCES task_status (id);
