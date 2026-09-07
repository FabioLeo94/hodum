-- add valuta a companies (multi-valuta, punto 1 di .tasks/TASK.md)
-- Nessuna conversione tra valute: valuta serve solo a etichettare/formattare
-- gli importi già espressi in tariffa_oraria (companies)/tariffa_oraria
-- (customers)/totale_importo (invoices), che restano numeri puri come oggi.
-- Obbligatoria e sempre valorizzata (a differenza di tariffa_oraria, che può
-- restare null finché l'owner non la compila): un'azienda opera sempre in
-- un'unica valuta base, DEFAULT 'EUR' per non lasciare le aziende già
-- esistenti senza un valore.
-- Stesso elenco chiuso del CHECK su customers.valuta (0044) e invoices.valuta
-- (0045): le tre tabelle condividono la stessa lista, vedi
-- backend/src/utils/currency.ts.

ALTER TABLE companies
  ADD COLUMN valuta varchar(3) NOT NULL DEFAULT 'EUR'
    CHECK (valuta IN ('EUR','USD','GBP','CHF','JPY','CAD','AUD','CNY'));
