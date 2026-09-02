-- add created_at e last_login_at a users
-- Task "Modifica account": traccia quando un account è stato creato e quando
-- ha effettuato l'ultimo accesso, entrambi mostrati in sola lettura nelle
-- modali di modifica utente (self-service e owner-su-dipendente) e, per il
-- dipendente, nella topbar al posto del link "Dipendenti" che non vede.
-- created_at è NOT NULL: ogni account, passato o futuro, ha sempre una data
-- di creazione. Il default è now() (non una costante, a differenza di
-- must_change_password in 0016): per le righe già esistenti non esiste una
-- data di creazione reale da recuperare, quindi si usa la data della
-- migration stessa come approssimazione accettata esplicitamente dal task.
-- Essendo un'espressione volatile, Postgres non può applicare l'ottimizzazione
-- "solo catalogo" di un default costante: la ADD COLUMN riscrive la tabella,
-- valutando now() una sola volta per l'intera istruzione (stesso valore per
-- tutte le righe esistenti), accettabile per le poche righe attuali di users.
-- last_login_at resta invece nullable e senza default: un account mai
-- autenticato (o già esistente, per cui non abbiamo lo storico) non ha
-- ancora un ultimo accesso da mostrare, a differenza di created_at.
-- Nessun indice: entrambe le colonne si leggono sempre per un singolo utente
-- già identificato (dal JWT o da un id di path), mai come filtro su tutta la
-- tabella.

ALTER TABLE users
  ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN last_login_at timestamptz;
