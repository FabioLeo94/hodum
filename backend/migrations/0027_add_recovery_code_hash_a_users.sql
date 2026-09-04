-- add recovery code hash a users
-- Task "recovery del titolare": l'owner è in cima alla gerarchia aziendale
-- (companyService.registerCompany), nessuno sopra di lui può resettargli la
-- password come invece fa lui stesso per un dipendente/manager (PUT
-- /users/{id}, vedi userController.ts). Senza questa colonna, un owner che
-- dimentica la password perde l'accesso in modo definitivo: il progetto
-- resta volutamente senza email/servizi esterni (nessun invio di link di
-- reset), quindi il recupero passa da un codice generato una sola volta alla
-- registrazione (companyService.registerCompany, prossimo commit) e mostrato
-- una sola volta all'owner, sullo stesso principio di una seed phrase.
--
-- Nullable: valorizzata solo per righe con role = 'owner' (unico ruolo
-- raggiungibile solo tramite registerCompany, mai promuovibile via API — vedi
-- UpdateUserRequest.role in userController.ts); dipendenti e manager non ne
-- hanno mai bisogno, restano su NULL.
--
-- text invece di varchar, stesso tipo/idea della colonna password (0002): è
-- un hash bcrypt, non un valore a lunghezza fissa da vincolare.
--
-- Nessun indice: letta sempre per un singolo utente già identificato per
-- email (stesso pattern di login in authService.ts), mai come filtro su
-- tutta la tabella.

ALTER TABLE users
  ADD COLUMN recovery_code_hash text;
