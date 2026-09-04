-- create company_backup_settings e company_backups
-- Feature "Gestione aziendale > Backup" (.tasks/TASK.md, priorità 1): backup
-- periodico del database via pg_dump, configurabile per azienda dall'owner
-- (frequenza, numero massimo conservato, formato del nome file), più
-- l'esecuzione manuale on-demand.
--
-- Una riga per azienda: company_id come PK invece di un id proprio, coerente
-- con l'idea "impostazioni singleton per company" (stesso pattern concettuale
-- di companies stessa, non una lista di record).
--
-- next_index: contatore monotono usato per il placeholder {index} nel nome
-- file (vedi utils/backupFilename.ts). Non deriva da COUNT(*) su
-- company_backups perché la rotazione cancella le righe più vecchie: un
-- indice derivato da COUNT tornerebbe indietro dopo ogni cancellazione e
-- potrebbe ripetersi, un contatore che cresce sempre no.
--
-- last_backup_at: timestamp dell'ultimo backup riuscito (manuale o
-- schedulato). Lo scheduler (backupService.ts) confronta questo valore con
-- interval_minutes per decidere se è il momento del prossimo backup:
-- un'esecuzione manuale lo aggiorna esattamente come una schedulata, quindi
-- "resetta" naturalmente il countdown senza bisogno di uno stato separato.
CREATE TABLE company_backup_settings (
  company_id       uuid    NOT NULL,
  interval_minutes integer NOT NULL DEFAULT 15,
  max_backups      integer NOT NULL DEFAULT 25,
  filename_format  varchar NOT NULL DEFAULT '{company}_{date}_{time}_{index}',
  next_index       integer NOT NULL DEFAULT 1,
  last_backup_at   timestamptz,
  CONSTRAINT company_backup_settings_pk PRIMARY KEY (company_id),
  CONSTRAINT company_backup_settings_company_id_fk FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
  CONSTRAINT company_backup_settings_interval_minutes_check CHECK (interval_minutes >= 1),
  CONSTRAINT company_backup_settings_max_backups_check CHECK (max_backups >= 1)
);

-- Storico dei singoli file prodotti: serve sia a mostrare l'elenco
-- nel drawer (data, dimensione, se manuale o schedulato) sia alla rotazione
-- (cancellare le righe/file più vecchi oltre max_backups). triggered_by
-- varchar con CHECK invece di un tipo enum Postgres: stesso stile già usato
-- da task_status (0004) e notifications.type (0025), un solo posto (qui) da
-- toccare se in futuro si aggiunge un terzo trigger (es. "pre-restore").
CREATE TABLE company_backups (
  id           uuid        NOT NULL DEFAULT gen_random_uuid(),
  company_id   uuid        NOT NULL,
  filename     varchar     NOT NULL,
  size_bytes   bigint      NOT NULL,
  triggered_by varchar     NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_backups_pk PRIMARY KEY (id),
  CONSTRAINT company_backups_company_id_fk FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
  CONSTRAINT company_backups_triggered_by_check CHECK (triggered_by IN ('manual', 'scheduled'))
);

-- Due letture ricorrenti guidano l'indice: "ultimi N backup di un'azienda"
-- (drawer) e "quali cancellare durante la rotazione" (entrambe ordinate per
-- created_at all'interno della stessa company_id).
CREATE INDEX company_backups_company_id_created_at_idx ON company_backups (company_id, created_at);
