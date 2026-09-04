import { API_BASE_URL, readErrorMessage } from "../httpClient";
import { authFetch, authHeader } from "../auth/authService";

// Stessa forma camelCase dell'entità esposta dal backend (vedi
// backend/src/models/backup.ts).
export interface BackupSettings {
  companyId: string;
  intervalMinutes: number;
  maxBackups: number;
  filenameFormat: string;
  lastBackupAt: string | null;
}

export type BackupTrigger = "manual" | "scheduled";

export interface BackupRecord {
  id: string;
  companyId: string;
  filename: string;
  sizeBytes: number;
  triggeredBy: BackupTrigger;
  createdAt: string;
}

export interface UpdateBackupSettingsInput {
  intervalMinutes: number;
  maxBackups: number;
  filenameFormat: string;
}

// Stesso principio 404 di getCompanyName in companyService.ts: solo owner
// (backend @Security('owner')), un id fuori dalla propria company risponde
// 404, mai un 403 che confermerebbe l'esistenza di un'azienda altrui.
export async function getBackupSettings(companyId: string): Promise<BackupSettings> {
  const response = await authFetch(`${API_BASE_URL}/companies/${companyId}/backups/settings`, {
    headers: authHeader(),
  });
  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message ?? "Impossibile caricare le impostazioni di backup.");
  }
  return (await response.json()) as BackupSettings;
}

export async function updateBackupSettings(
  companyId: string,
  input: UpdateBackupSettingsInput,
): Promise<BackupSettings> {
  const response = await authFetch(`${API_BASE_URL}/companies/${companyId}/backups/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const message = await readErrorMessage(response);
    if (response.status === 422) {
      throw new Error(message ?? "Impostazioni di backup non valide.");
    }
    throw new Error(message ?? "Impossibile aggiornare le impostazioni di backup.");
  }
  return (await response.json()) as BackupSettings;
}

// Sincrona lato backend (attende il pg_dump prima di rispondere, vedi
// backupController.ts): la UI mostra uno stato di caricamento sul bottone
// "Esegui ora" per la durata della chiamata, niente polling.
export async function runBackupNow(companyId: string): Promise<BackupRecord> {
  const response = await authFetch(`${API_BASE_URL}/companies/${companyId}/backups/run`, {
    method: "POST",
    headers: authHeader(),
  });
  if (!response.ok) {
    const message = await readErrorMessage(response);
    if (response.status === 409) {
      throw new Error(message ?? "Un backup per questa azienda è già in corso.");
    }
    throw new Error(message ?? "Esecuzione del backup non riuscita.");
  }
  return (await response.json()) as BackupRecord;
}

export async function listBackups(companyId: string): Promise<BackupRecord[]> {
  const response = await authFetch(`${API_BASE_URL}/companies/${companyId}/backups`, {
    headers: authHeader(),
  });
  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message ?? "Impossibile caricare lo storico dei backup.");
  }
  return (await response.json()) as BackupRecord[];
}
