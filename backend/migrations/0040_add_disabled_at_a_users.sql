-- add disabled_at a users
-- Task "blocco utente": ad oggi un dipendente/manager può solo essere
-- eliminato, mai bloccato temporaneamente. Serve per rispettare un eventuale
-- obbligo contrattuale di ritenzione dati (l'azienda deve trattenerli per tot
-- giorni per motivi di sicurezza prima di poterli eliminare definitivamente).
-- Timestamp e non booleano: memorizzare QUANDO l'utente è stato bloccato è
-- ciò che serve per un futuro calcolo "sono passati i tot giorni
-- contrattuali", cosa che un semplice flag non permetterebbe senza una
-- colonna aggiuntiva. NULL = utente attivo (default per ogni riga esistente e
-- futura), non-NULL = utente bloccato da quella data.
-- Nessun indice: si legge sempre per un singolo utente già identificato (dal
-- JWT o da un id di path), mai come filtro su tutta la tabella, stesso
-- principio di last_login_at (migrations/0019).

ALTER TABLE users
  ADD COLUMN disabled_at timestamptz;
