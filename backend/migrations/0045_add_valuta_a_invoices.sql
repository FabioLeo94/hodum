-- add valuta a invoices (multi-valuta, punto 3 di .tasks/TASK.md)
-- Snapshot risolto (cliente -> azienda, stessa regola a due livelli di
-- tariffa_oraria_snapshot in invoice_items/0037) al momento della
-- generazione: una pre-fattura già emessa non cambia mai valuta anche se
-- l'azienda o il cliente la modificano dopo, stesso principio di
-- cancelled_at (0042) e tariffa_oraria_snapshot per l'immutabilità storica.
-- DEFAULT 'EUR' solo per il backfill delle righe già esistenti (create prima
-- di questa colonna, tutte effettivamente in EUR): invoiceService valorizza
-- sempre valuta esplicitamente in ogni nuovo INSERT, il default non viene mai
-- più usato da lì in avanti.

ALTER TABLE invoices
  ADD COLUMN valuta varchar(3) NOT NULL DEFAULT 'EUR'
    CHECK (valuta IN ('EUR','USD','GBP','CHF','JPY','CAD','AUD','CNY'));
