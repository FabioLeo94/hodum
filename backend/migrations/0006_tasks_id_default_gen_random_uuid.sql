-- tasks id default gen_random_uuid
-- tasks.id è uuid NOT NULL senza DEFAULT (vedi 0002_baseline_schema_esistente.sql,
-- righe 43-51): lo stesso gap già corretto per projects dalla migration
-- 0005_projects_id_default_gen_random_uuid.sql. Serve ora perché l'endpoint
-- POST /projects/{projectId}/tasks in arrivo dovrà inserire righe in tasks, e
-- deve poterlo fare con lo stesso pattern già in uso per projects (id
-- generato dal database, non a mano nel service con randomUUID() di
-- node:crypto). gen_random_uuid() è disponibile nel core di Postgres dal 13
-- in poi (verificato: questo server è 18.4) senza bisogno dell'extension
-- uuid-ossp che servirebbe per uuid_generate_v4().
-- Verificato prima di scrivere questa migration: tasks ha 0 righe (nessun
-- endpoint di creazione è ancora in produzione). ALTER COLUMN ... SET
-- DEFAULT è un'operazione di sola metadata: non tocca le righe esistenti (a
-- differenza di ADD COLUMN con default volatile), quindi non serve nessun
-- trattamento speciale né un lock diverso dal solito ACCESS EXCLUSIVE breve
-- preso da ALTER TABLE.

ALTER TABLE tasks
  ALTER COLUMN id SET DEFAULT gen_random_uuid();
