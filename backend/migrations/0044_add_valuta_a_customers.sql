-- add valuta a customers (multi-valuta, punto 2 di .tasks/TASK.md)
-- A differenza di companies.valuta (0043), qui è nullable per sempre: null
-- significa "eredita la valuta della company di appartenenza", stessa
-- semantica già in uso per tariffa_oraria/tariffa_unita (0034). Nessun
-- DEFAULT: un cliente nuovo non ha una valuta propria finché l'owner non la
-- imposta esplicitamente.

ALTER TABLE customers
  ADD COLUMN valuta varchar(3)
    CHECK (valuta IN ('EUR','USD','GBP','CHF','JPY','CAD','AUD','CNY'));
