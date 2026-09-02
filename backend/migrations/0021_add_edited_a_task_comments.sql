-- add edited a task_comments
-- Task "Commenti: modifica ed eliminazione": l'eliminazione non richiede
-- schema (DELETE diretto sulla riga, invariato), la modifica invece deve
-- distinguere un commento mai toccato da uno riscritto dall'autore, per
-- mostrare "modificato" accanto a data/ora in UI (vedi
-- TaskCommentsPanelComponent) senza dover confrontare updated_at con
-- created_at — differenza che un UPDATE che tocca solo body senza cambiarne
-- il contenuto renderebbe comunque ambigua.
-- Boolean con default false, coerente con must_change_password (0016): ogni
-- commento nuovo o già esistente parte "non modificato" finché un UPDATE
-- esplicito lo marca true, mai il contrario.
-- Nessun updated_at: la sola informazione richiesta è "è stato modificato
-- almeno una volta", non quando l'ultima modifica è avvenuta.

ALTER TABLE task_comments
  ADD COLUMN edited boolean NOT NULL DEFAULT false;
