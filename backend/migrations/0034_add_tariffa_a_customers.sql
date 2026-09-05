-- add tariffa a customers (pre-fatturazione, punto 2)
-- A differenza di companies.tariffa_oraria (0033), qui il campo è
-- opzionale per sempre: se il cliente non ha una tariffa propria, la futura
-- pre-fatturazione userà quella dell'azienda a cui appartiene. Stessa
-- semantica di canonicità: tariffa_oraria è sempre in €/ora, tariffa_unita
-- serve solo a ricordare in che unità mostrarla.
-- Il cliente non ha propri giorni/orari di lavoro: per le conversioni di
-- unità si riusano sempre lunedi..domenica e le fasce orarie della company
-- di appartenenza (companies.lavora_*/ora_*, 0033), quindi qui non si
-- aggiungono colonne equivalenti.

ALTER TABLE customers
  ADD COLUMN tariffa_oraria numeric(10,2),
  ADD COLUMN tariffa_unita  varchar CHECK (tariffa_unita IN ('oraria','giornaliera','settimanale','mensile','annuale'));
