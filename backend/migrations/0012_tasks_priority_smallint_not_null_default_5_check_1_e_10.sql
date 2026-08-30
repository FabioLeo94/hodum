-- tasks priority smallint not null default 5 check 1 e 10
-- Nuovo campo per ordinare i task nel frontend: intero da 1 (priorità ALTA) a
-- 10 (priorità BASSA). Stesso pattern già usato per tasks.status (vedi 0004):
-- smallint con un DEFAULT medio, così le righe esistenti non restano NULL e
-- il codice applicativo può iniziare a leggerla subito senza un passaggio di
-- backfill separato.
-- Verificato prima di scrivere questa migration: tasks ha 3 righe (non è
-- vuota, a differenza di 0003/0004 che potevano fare ALTER diretti su tabelle
-- a 0 righe) e siamo su Postgres 18 (server_version_num 180004). Da Postgres
-- 11 in poi ADD COLUMN ... NOT NULL DEFAULT <costante> non riscrive la
-- tabella: il default costante viene scritto nel catalogo e applicato ai
-- valori letti, non riga per riga, quindi non serve il pattern
-- NOT VALID + VALIDATE in due passi (quello resta necessario solo per
-- aggiungere NOT NULL a una colonna già esistente e popolata con valori
-- potenzialmente NULL, vedi 0003). Qui la colonna è nuova e il default è la
-- costante 5, non un'espressione volatile: un singolo ALTER TABLE basta e non
-- prende un lock più lungo di un DDL normale.
ALTER TABLE tasks
  ADD COLUMN priority smallint NOT NULL DEFAULT 5
    CONSTRAINT tasks_priority_range_check CHECK (priority BETWEEN 1 AND 10);
