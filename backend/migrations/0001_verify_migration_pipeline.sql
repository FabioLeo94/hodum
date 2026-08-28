-- Migration di verifica: non introduce schema applicativo. Serve solo a
-- confermare che "npm run migrate:up" legge questa cartella, applica un file
-- dentro una transazione e lo registra in schema_migrations senza
-- riapplicarlo alle run successive. Va rimossa (o lasciata: è innocua) quando
-- arriva la prima migration reale con schema applicativo.
SELECT 1;
