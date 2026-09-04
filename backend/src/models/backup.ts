// Forma dell'entità esposta dall'API: camelCase lato applicativo, coerente
// con company.ts/notification.ts (vedi migrations/0028_create_company_backup_settings_e_company_backups.sql).
export interface BackupSettings {
  companyId: string;
  intervalMinutes: number;
  maxBackups: number;
  filenameFormat: string;
  lastBackupAt: string | null;
}

export type BackupTrigger = 'manual' | 'scheduled' | 'pre-restore';

export interface BackupRecord {
  id: string;
  companyId: string;
  filename: string;
  sizeBytes: number;
  triggeredBy: BackupTrigger;
  createdAt: string;
}
