-- projects id default gen_random_uuid
-- projects.id è uuid NOT NULL senza DEFAULT (vedi 0002_baseline_schema_esistente.sql,
-- righe 36-41): l'id viene generato a mano in projectService.ts con
-- randomUUID() di node:crypto invece che dal database. Sposta la generazione
-- nel database con gen_random_uuid(), disponibile nel core di Postgres dal
-- 13 in poi (verificato: questo server è 18.4) senza bisogno dell'extension
-- uuid-ossp che servirebbe per uuid_generate_v4().
-- Verificato prima di scrivere questa migration: projects ha 1 sola riga, con
-- id già valorizzato. ALTER COLUMN ... SET DEFAULT è un'operazione di sola
-- metadata: non tocca le righe esistenti (a differenza di ADD COLUMN con
-- default volatile), quindi non serve nessun trattamento speciale per quella
-- riga né un lock diverso dal solito ACCESS EXCLUSIVE breve preso da ALTER
-- TABLE.

ALTER TABLE projects
  ALTER COLUMN id SET DEFAULT gen_random_uuid();
