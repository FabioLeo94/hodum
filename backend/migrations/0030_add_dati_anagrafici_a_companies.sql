-- add dati anagrafici a companies
-- Task "Modifica dati aziendali": la pagina Gestione aziendale (companyManagement.tsx)
-- guadagna una card che apre un drawer per modificare l'anagrafica dell'azienda,
-- finora limitata al solo "name" (0013). Aggiunge i campi utili per una PMI/
-- freelance italiana che fattura: ragione sociale (può differire dal nome
-- commerciale), P.IVA, codice fiscale, indirizzo e PEC.
-- Tutti nullable tranne created_at: nessuno di questi dati esiste ancora per le
-- aziende già registrate e non c'è modo di recuperarlo retroattivamente, a
-- differenza di created_at che accetta l'approssimazione "data della
-- migration" già usata in 0019 per users.created_at.
-- Nessun CHECK di formato qui (es. 11 cifre per piva): la validazione vive
-- lato applicativo (companyController.ts), stesso principio di
-- isValidEmail/isValidPassword in utils/validation.ts, per poter cambiare la
-- policy senza una migration.

ALTER TABLE companies
  ADD COLUMN ragione_sociale  varchar,
  ADD COLUMN piva             varchar(11),
  ADD COLUMN codice_fiscale   varchar(16),
  ADD COLUMN indirizzo        varchar,
  ADD COLUMN pec              varchar,
  ADD COLUMN created_at       timestamptz NOT NULL DEFAULT now();
