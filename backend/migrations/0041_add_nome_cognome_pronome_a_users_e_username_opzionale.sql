-- add nome cognome pronome a users e username opzionale
-- Introduciamo dati anagrafici veri (nome, cognome, pronome) per smettere di
-- usare lo username come unico identificativo mostrato in UI, ed è il primo
-- passo per rendere lo username stesso facoltativo: un utente potrà d'ora in
-- avanti autenticarsi/essere identificato senza averne uno.
-- first_name/last_name diventano NOT NULL: sono anagrafici obbligatori per
-- ogni utente andando avanti. La colonna nasce nullable per poter fare il
-- backfill (ADD COLUMN NOT NULL senza DEFAULT su una tabella popolata
-- fallirebbe subito), poi si stringe in due passi separati, come già fatto
-- altrove in questo progetto per introdurre un NOT NULL su una tabella con
-- righe esistenti.
-- Il placeholder letterale 'Nome'/'Cognome' copre le righe già presenti, che
-- hanno oggi tutte uno username (essendo finora obbligatorio): non verrà mai
-- mostrato in UI finché quell'utente continua ad avere uno username. Non è
-- un default di colonna perché deve valere solo per il backfill, non per gli
-- inserimenti futuri: un nuovo utente deve fornire nome e cognome veri.
-- pronoun resta nullable e sempre facoltativo: nessun backfill necessario.
-- users_unique (UNIQUE su username) non viene toccato: in Postgres più righe
-- con username IS NULL non violano un vincolo UNIQUE (NULL non è mai uguale
-- a NULL), quindi più utenti senza username potranno coesistere.

ALTER TABLE users
  ADD COLUMN first_name varchar,
  ADD COLUMN last_name varchar,
  ADD COLUMN pronoun varchar;

UPDATE users SET first_name = 'Nome', last_name = 'Cognome' WHERE first_name IS NULL;

ALTER TABLE users
  ALTER COLUMN first_name SET NOT NULL,
  ALTER COLUMN last_name SET NOT NULL;

ALTER TABLE users
  ALTER COLUMN username DROP NOT NULL;
