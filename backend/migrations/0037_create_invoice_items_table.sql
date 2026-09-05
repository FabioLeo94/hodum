-- create invoice items table (pre-fatturazione, punto 3)
-- Righe di dettaglio di una pre-fattura, una per task incluso. UNIQUE
-- (task_id) è voluto e critico: garantisce a livello DB che un task non
-- possa mai finire in due pre-fatture diverse (regola di business: una volta
-- fatturato, un task è lockato per sempre, nessuna "sfattura" in questa
-- fase). task_id senza ON DELETE CASCADE (default RESTRICT): impedisce di
-- cancellare un task già fatturato, difesa in profondità oltre al controllo
-- applicativo lato service.
-- invoice_id invece è ON DELETE CASCADE: cancellare una pre-fattura (es. se
-- generata per errore prima che diventi definitiva) deve portarsi via le
-- sue righe, non lasciarle orfane.
-- project_id è denormalizzato da tasks.project_id: serve a raggruppare le
-- righe per progetto nel PDF senza dover risalire a tasks (che a quel punto
-- ha già invoice_id valorizzato, vedi 0038, ma non project_id storico se il
-- task venisse spostato di progetto in futuro).
-- tariffa_oraria_snapshot congela la tariffa usata al momento della
-- fatturazione (cliente o azienda, la logica sta nel service): la tariffa
-- corrente di customers/companies può cambiare dopo, la fattura emessa no.
-- non_fatturabile marca righe incluse nel conteggio ore ma escluse dal
-- totale economico (es. correzioni, task di cortesia).

CREATE TABLE invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
  task_id uuid NOT NULL UNIQUE REFERENCES tasks (id),
  project_id uuid NOT NULL REFERENCES projects (id),
  secondi_fatturati integer NOT NULL CHECK (secondi_fatturati >= 0),
  tariffa_oraria_snapshot numeric(10,2) NOT NULL,
  non_fatturabile boolean NOT NULL DEFAULT false
);
