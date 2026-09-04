-- add pre-restore a company_backups triggered_by check
-- La feature di ripristino ("Applica backup", backupService.restoreBackup)
-- crea sempre uno snapshot di sicurezza dello stato attuale PRIMA di
-- sovrascrivere il database con un backup più vecchio: senza, un ripristino
-- indesiderato sarebbe irreversibile. Il CHECK di 0028 ammetteva solo
-- 'manual'/'scheduled' (lo commentava già come possibile terzo trigger
-- futuro), quindi va esteso per accettare anche 'pre-restore'.
ALTER TABLE company_backups DROP CONSTRAINT company_backups_triggered_by_check;
ALTER TABLE company_backups ADD CONSTRAINT company_backups_triggered_by_check
  CHECK (triggered_by IN ('manual', 'scheduled', 'pre-restore'));
