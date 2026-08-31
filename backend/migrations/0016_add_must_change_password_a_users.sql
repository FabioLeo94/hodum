-- add must change password a users
-- .tasks/TASK.md punto 4: primo passo per forzare il cambio password al primo
-- accesso di un dipendente creato dall'owner. Il DEFAULT a livello di colonna
-- è false, non true: sia le righe utente già esistenti sia i futuri owner
-- creati da registerCompany (companyService.ts) si autenticano con una
-- password che hanno scelto loro e non devono mai vedersi imposto un cambio —
-- false è il default sicuro e non intrusivo. Il valore true non passa mai da
-- qui: sarà companyService.createEmployee, nel prossimo commit, a valorizzarlo
-- esplicitamente nella lista colonne dell'INSERT che crea un dipendente.
-- Questa migration si limita allo schema, non tocca createEmployee né altro
-- codice TypeScript.
-- ADD COLUMN ... NOT NULL DEFAULT <costante> è, da Postgres 11 in poi,
-- un'operazione di solo catalogo: il default costante (non un'espressione
-- volatile) viene applicato ai valori letti invece di riscrivere ogni riga,
-- stesso ragionamento già fatto in 0012 per tasks.priority — quindi nessun
-- backfill da giustificare per le 3 righe di users già presenti.
-- Nessun indice: la colonna si legge sempre per un singolo utente già
-- identificato dal JWT, mai come filtro su tutta la tabella.

ALTER TABLE users
  ADD COLUMN must_change_password boolean NOT NULL DEFAULT false;
