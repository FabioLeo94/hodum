-- add cancelled_at a invoices (annullamento pre-fattura)
-- Soft-cancel: la riga resta in invoices (storico), non viene mai eliminata
-- né il suo `numero` viene riassegnato — stessa logica della numerazione
-- fiscale progressiva già in vigore (UNIQUE (company_id, numero) in 0036),
-- un annullamento reale non "libera" mai un numero già emesso. NULL finché la
-- pre-fattura è attiva, valorizzato da invoiceService.cancelInvoice al
-- momento dell'annullamento. Nullable, ADD COLUMN senza default volatile:
-- metadata-only, nessuna riscrittura della tabella (stesso principio di 0038,
-- 0040).

ALTER TABLE invoices ADD COLUMN cancelled_at timestamptz NULL;
