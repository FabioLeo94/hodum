-- users id default gen_random_uuid
-- users.id è uuid NOT NULL senza DEFAULT (baseline 0002, righe 26-34): unica
-- delle tre tabelle con id uuid rimasta indietro rispetto al pattern già
-- applicato a projects (0005) e tasks (0006), dove la generazione è stata
-- spostata dal service (randomUUID() di node:crypto) al database
-- (gen_random_uuid()). userService.createUser continua oggi a generare l'id
-- in app e passarlo esplicitamente nell'INSERT: questa migration non richiede
-- né presuppone una modifica a userService, si limita a chiudere
-- l'incoerenza a livello di schema in modo avanti-compatibile (un DEFAULT non
-- si applica quando l'INSERT valorizza già la colonna). Un futuro allineamento
-- di userService allo stesso pattern di projectService/taskService (smettere
-- di generare l'id in app) resta una scelta separata, non fatta qui.
-- ALTER COLUMN ... SET DEFAULT è un'operazione di sola metadata: non tocca le
-- righe esistenti (a differenza di ADD COLUMN con default volatile), quindi
-- non serve nessun trattamento speciale per le 2 righe già presenti in users
-- né un lock diverso dal solito breve preso da ALTER TABLE.

ALTER TABLE users
  ALTER COLUMN id SET DEFAULT gen_random_uuid();
