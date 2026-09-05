import { execFile } from 'node:child_process';
import { mkdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { PoolClient } from 'pg';
import type { BackupRecord, BackupSettings, BackupTrigger } from '../models/backup';
import { isValidFilenameFormat, renderBackupFilename } from '../utils/backupFilename';
import { assertValid } from '../utils/validation';
import { pool } from '../db/pool';
import { getCompanyById } from './companyService';

// Punto 2 della code review "niente logica nei controller": prima vivevano in
// backupController.ts, ripetuti a mano per ogni campo invece che validati qui
// una sola volta.
const MIN_INTERVAL_MINUTES = 1;
const MAX_INTERVAL_MINUTES = 10_080; // 7 giorni: oltre non ha senso chiamarlo backup "periodico".
const MIN_MAX_BACKUPS = 1;
const MAX_MAX_BACKUPS = 500; // Limite di buon senso: oltre, la rotazione perde significato pratico per una PMI.

const execFileAsync = promisify(execFile);

// backend/backups: stessa profondità di migrations rispetto a __dirname
// (vedi db/migrate.ts, che risale da src/db a backend/ con la stessa coppia
// di '..'), qui da src/services. Fuori da src/ e da dist/ così sopravvive
// indipendentemente da dove gira il codice compilato, e va escluso da git
// (vedi backend/.gitignore) perché contiene dump del database, non codice.
const BACKUPS_DIR = join(__dirname, '..', '..', 'backups');

// Un solo backup alla volta per azienda: senza, il tick dello scheduler e un
// click manuale dell'owner potrebbero sovrapporsi e far scrivere due processi
// pg_dump in corsa sullo stesso indice. Un incidente reale (non solo
// teorico) ha dimostrato che l'assunzione "un solo processo Node" non regge:
// più istanze del backend rimaste accese per errore (es. un vecchio `npm run
// dev` mai fermato prima di riavviarlo) hanno lo scheduler di ognuna che
// gira per conto proprio, senza nessun coordinamento tra loro. Un Set
// in-memory (come in una prima versione di questo file) protegge solo da
// doppie chiamate nello STESSO processo: qui serve invece un lock a livello
// di database, visibile a qualunque processo si connetta allo stesso
// Postgres — pg_try_advisory_lock, rilasciato sulla stessa connessione che
// lo ha acquisito (vedi acquireBackupLock sotto).
function backupLockKeyExpression(placeholder: string): string {
  // Un advisory lock Postgres è una chiave bigint (64 bit), non una stringa:
  // md5(company_id) dà 32 caratteri esadecimali, i primi 16 diventano un
  // bigint tramite un giro per bit(64) — idioma standard per trasformare una
  // stringa arbitraria in una chiave di lock deterministica senza dover
  // gestire l'hashing lato applicativo.
  return `('x' || substr(md5(${placeholder}), 1, 16))::bit(64)::bigint`;
}

async function acquireBackupLock(client: PoolClient, companyId: string): Promise<boolean> {
  const result = await client.query<{ acquired: boolean }>(
    `SELECT pg_try_advisory_lock(${backupLockKeyExpression('$1')}) AS acquired`,
    [companyId],
  );
  return result.rows[0].acquired;
}

async function releaseBackupLock(client: PoolClient, companyId: string): Promise<void> {
  await client.query(`SELECT pg_advisory_unlock(${backupLockKeyExpression('$1')})`, [companyId]);
}

export class BackupInProgressError extends Error {
  constructor() {
    super('Un backup per questa azienda è già in corso');
    this.name = 'BackupInProgressError';
  }
}

export class CompanyNotFoundForBackupError extends Error {
  constructor() {
    super('Azienda non trovata');
    this.name = 'CompanyNotFoundForBackupError';
  }
}

export class BackupNotFoundError extends Error {
  constructor() {
    super('Backup non trovato');
    this.name = 'BackupNotFoundError';
  }
}

interface BackupSettingsRow {
  company_id: string;
  interval_minutes: number;
  max_backups: number;
  filename_format: string;
  last_backup_at: Date | null;
}

const SETTINGS_COLUMNS = 'company_id, interval_minutes, max_backups, filename_format, last_backup_at';

function toBackupSettings(row: BackupSettingsRow): BackupSettings {
  return {
    companyId: row.company_id,
    intervalMinutes: row.interval_minutes,
    maxBackups: row.max_backups,
    filenameFormat: row.filename_format,
    lastBackupAt: row.last_backup_at ? row.last_backup_at.toISOString() : null,
  };
}

// Creata al primo accesso invece che alla registrazione azienda
// (companyService.registerCompany): tiene la feature backup indipendente dal
// flusso di registrazione, comodo anche per aziende già esistenti create
// prima di questa migration. ON CONFLICT DO NOTHING + riselezione copre la
// corsa tra due richieste concorrenti che la trovano assente entrambe.
async function getOrCreateSettingsRow(companyId: string): Promise<BackupSettingsRow> {
  const existing = await pool.query<BackupSettingsRow>(
    `SELECT ${SETTINGS_COLUMNS} FROM company_backup_settings WHERE company_id = $1`,
    [companyId],
  );
  if (existing.rows[0]) return existing.rows[0];

  const inserted = await pool.query<BackupSettingsRow>(
    `INSERT INTO company_backup_settings (company_id) VALUES ($1)
     ON CONFLICT (company_id) DO NOTHING
     RETURNING ${SETTINGS_COLUMNS}`,
    [companyId],
  );
  if (inserted.rows[0]) return inserted.rows[0];

  const retried = await pool.query<BackupSettingsRow>(
    `SELECT ${SETTINGS_COLUMNS} FROM company_backup_settings WHERE company_id = $1`,
    [companyId],
  );
  return retried.rows[0];
}

export async function getBackupSettings(companyId: string): Promise<BackupSettings> {
  return toBackupSettings(await getOrCreateSettingsRow(companyId));
}

export interface UpdateBackupSettingsInput {
  intervalMinutes: number;
  maxBackups: number;
  filenameFormat: string;
}

// Validazione dei range (interval/max, formato filename) prima duplicata a
// mano in backupController.putSettings (punto 2 della code review "niente
// logica nei controller"): ora un assertValid per campo, con la stessa
// ValidationError mappata a 422 nell'error handler globale (app.ts) invece
// che qui.
function validateBackupSettingsInput(input: UpdateBackupSettingsInput): void {
  assertValid(
    Number.isInteger(input.intervalMinutes) &&
      input.intervalMinutes >= MIN_INTERVAL_MINUTES &&
      input.intervalMinutes <= MAX_INTERVAL_MINUTES,
    'intervalMinutes',
    `intervalMinutes deve essere un intero tra ${MIN_INTERVAL_MINUTES} e ${MAX_INTERVAL_MINUTES}`,
  );
  assertValid(
    Number.isInteger(input.maxBackups) && input.maxBackups >= MIN_MAX_BACKUPS && input.maxBackups <= MAX_MAX_BACKUPS,
    'maxBackups',
    `maxBackups deve essere un intero tra ${MIN_MAX_BACKUPS} e ${MAX_MAX_BACKUPS}`,
  );
  assertValid(
    isValidFilenameFormat(input.filenameFormat),
    'filenameFormat',
    'filenameFormat non valido: sono ammessi solo lettere, numeri, spazi, "_", "-", "." e i placeholder {company} {date} {time} {index}',
  );
}

export async function updateBackupSettings(companyId: string, input: UpdateBackupSettingsInput): Promise<BackupSettings> {
  validateBackupSettingsInput(input);
  await getOrCreateSettingsRow(companyId);
  const result = await pool.query<BackupSettingsRow>(
    `UPDATE company_backup_settings
     SET interval_minutes = $2, max_backups = $3, filename_format = $4
     WHERE company_id = $1
     RETURNING ${SETTINGS_COLUMNS}`,
    [companyId, input.intervalMinutes, input.maxBackups, input.filenameFormat],
  );
  return toBackupSettings(result.rows[0]);
}

interface BackupRow {
  id: string;
  company_id: string;
  filename: string;
  size_bytes: string;
  triggered_by: BackupTrigger;
  created_at: Date;
}

function toBackupRecord(row: BackupRow): BackupRecord {
  return {
    id: row.id,
    companyId: row.company_id,
    filename: row.filename,
    // pg restituisce bigint come stringa (driver 'pg' non fa il cast
    // automatico, per non perdere precisione oltre Number.MAX_SAFE_INTEGER):
    // qui è sicuro convertire, una dimensione di file non si avvicina a quel
    // limite.
    sizeBytes: Number(row.size_bytes),
    triggeredBy: row.triggered_by,
    createdAt: row.created_at.toISOString(),
  };
}

export async function listBackups(companyId: string): Promise<BackupRecord[]> {
  const result = await pool.query<BackupRow>(
    `SELECT id, company_id, filename, size_bytes, triggered_by, created_at
     FROM company_backups
     WHERE company_id = $1
     ORDER BY created_at DESC`,
    [companyId],
  );
  return result.rows.map(toBackupRecord);
}

async function findBackupRow(companyId: string, backupId: string): Promise<BackupRow | undefined> {
  const result = await pool.query<BackupRow>(
    `SELECT id, company_id, filename, size_bytes, triggered_by, created_at
     FROM company_backups
     WHERE id = $1 AND company_id = $2`,
    [backupId, companyId],
  );
  return result.rows[0];
}

// Cancellazione di un singolo backup scelto dall'owner (a differenza di
// rotateOldBackups, automatica e per eccesso di quantità). Stesso ordine
// best-effort: la riga di metadata è il dato che conta per la UI, un file
// rimasto orfano sul disco (unlink fallito) non deve far fallire la richiesta.
export async function deleteBackup(companyId: string, backupId: string): Promise<void> {
  const target = await findBackupRow(companyId, backupId);
  if (!target) {
    throw new BackupNotFoundError();
  }
  await pool.query('DELETE FROM company_backups WHERE id = $1', [target.id]);
  try {
    await unlink(join(BACKUPS_DIR, target.filename));
  } catch (err) {
    console.error(`Impossibile eliminare il file di backup ${target.filename}:`, err);
  }
}

// UPDATE ... RETURNING next_index - 1: unica query atomica (il lock di riga
// implicito nell'UPDATE serializza due chiamate concorrenti), restituisce il
// valore PRE-incremento da usare come indice di questo backup mentre la
// colonna avanza già per il prossimo. Non deriva da COUNT(*) su
// company_backups: vedi commento su next_index nella migration.
async function consumeNextIndex(companyId: string): Promise<number> {
  const result = await pool.query<{ next_index: number }>(
    `UPDATE company_backup_settings
     SET next_index = next_index + 1
     WHERE company_id = $1
     RETURNING next_index - 1 AS next_index`,
    [companyId],
  );
  return result.rows[0].next_index;
}

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    // Non dovrebbe accadere: db/pool.ts fallisce già all'avvio del processo
    // se manca. Controllo esplicito comunque, stesso principio difensivo di
    // tokenService.requireSecret, invece di un'asserzione non-null silenziosa
    // su un valore che arriva da env.
    throw new Error('DATABASE_URL non impostata: impossibile eseguire pg_dump.');
  }
  return url;
}

// 'pg_dump' di default (cercato nel PATH di sistema): su Windows l'installer
// di PostgreSQL non lo aggiunge sempre al PATH, da qui questa variabile per
// puntare all'eseguibile con un percorso assoluto senza dover toccare il PATH
// di sistema (vedi .env.example). Stesso principio di FRONTEND_ORIGIN in
// app.ts: opzionale con un default che funziona nel caso comune.
function pgDumpExecutable(): string {
  return process.env.PG_DUMP_PATH || 'pg_dump';
}

// Cancella dal DB e dal filesystem i backup oltre max_backups, i più vecchi
// per company_id (OFFSET max_backups su created_at DESC = tutto ciò che
// eccede il limite). Il file mancante/non cancellabile è solo loggato
// (best-effort): la riga di metadata è comunque il dato che conta per la UI,
// un residuo orfano sul disco non deve far fallire l'intero backup appena
// riuscito.
async function rotateOldBackups(companyId: string, maxBackups: number): Promise<void> {
  const excess = await pool.query<{ id: string; filename: string }>(
    `SELECT id, filename FROM company_backups
     WHERE company_id = $1
     ORDER BY created_at DESC
     OFFSET $2`,
    [companyId, maxBackups],
  );
  for (const row of excess.rows) {
    await pool.query('DELETE FROM company_backups WHERE id = $1', [row.id]);
    try {
      await unlink(join(BACKUPS_DIR, row.filename));
    } catch (err) {
      console.error(`Impossibile eliminare il file di backup ${row.filename}:`, err);
    }
  }
}

interface PerformBackupOptions {
  // true solo per lo snapshot di sicurezza pre-restore (vedi restoreBackup):
  // la rotazione va rimandata a dopo il pg_restore, altrimenti potrebbe
  // cancellare proprio il file più vecchio che si sta per ripristinare, se
  // questo snapshot aggiuntivo lo spinge fuori dalla soglia max_backups.
  skipRotation?: boolean;
}

// Cuore della feature: esegue pg_dump, registra il risultato, applica la
// rotazione e aggiorna last_backup_at. Presuppone il lock di backup già
// acquisito dal chiamante (runBackup per l'uso normale, restoreBackup per lo
// snapshot pre-restore): estratta da un unico runBackup originario perché
// pg_try_advisory_lock è legato alla sessione che lo acquisisce, quindi
// restoreBackup non può ottenere un secondo backup "annidato" aprendo una
// nuova connessione, altrimenti si bloccherebbe (o fallirebbe) contro il
// proprio stesso lock.
async function performBackup(
  companyId: string,
  triggeredBy: BackupTrigger,
  options: PerformBackupOptions = {},
): Promise<BackupRecord> {
  const settings = await getOrCreateSettingsRow(companyId);
  const company = await getCompanyById(companyId);
  if (!company) {
    throw new CompanyNotFoundForBackupError();
  }

  await mkdir(BACKUPS_DIR, { recursive: true });

  const index = await consumeNextIndex(companyId);
  const filename = renderBackupFilename({
    format: settings.filename_format,
    companyName: company.name,
    index,
    now: new Date(),
  });
  const filePath = join(BACKUPS_DIR, filename);

  // execFile (non exec): argomenti passati come array, mai interpolati in
  // una stringa di shell, quindi immuni da command injection anche se
  // company.name o il formato configurato contenessero caratteri speciali
  // di shell. --format=custom produce un dump compresso, ripristinabile con
  // pg_restore (vedi restoreBackup). --no-owner/--no-privileges: un
  // ripristino su un'istanza Postgres diversa (es. dopo un cambio server)
  // non deve fallire per ruoli DB che lì non esistono.
  await execFileAsync(pgDumpExecutable(), [
    '--dbname',
    requireDatabaseUrl(),
    '--format=custom',
    '--no-owner',
    '--no-privileges',
    '--file',
    filePath,
  ]);

  const { size } = await stat(filePath);

  const inserted = await pool.query<BackupRow>(
    `INSERT INTO company_backups (company_id, filename, size_bytes, triggered_by)
     VALUES ($1, $2, $3, $4)
     RETURNING id, company_id, filename, size_bytes, triggered_by, created_at`,
    [companyId, filename, size, triggeredBy],
  );
  const record = toBackupRecord(inserted.rows[0]);

  await pool.query('UPDATE company_backup_settings SET last_backup_at = now() WHERE company_id = $1', [companyId]);
  if (!options.skipRotation) {
    await rotateOldBackups(companyId, settings.max_backups);
  }

  return record;
}

// Usata sia dal trigger manuale dell'owner sia dal tick schedulato (vedi
// runScheduledBackups sotto): aggiornare last_backup_at allo stesso modo in
// entrambi i casi è esattamente ciò che fa "resettare il timer" a
// un'esecuzione manuale, senza bisogno di uno stato separato per distinguerle.
export async function runBackup(companyId: string, triggeredBy: BackupTrigger): Promise<BackupRecord> {
  // Client dedicato tenuto aperto per tutta la durata: pg_try_advisory_lock è
  // legato alla SESSIONE che lo acquisisce, non a una singola query. Le
  // query di lavoro sotto restano su `pool` (connessioni intercambiabili,
  // gli advisory lock non sono legati a righe/tabelle su cui operano),
  // questo client serve solo a tenere viva la sessione che detiene il lock.
  const lockClient = await pool.connect();
  let lockAcquired = false;
  try {
    lockAcquired = await acquireBackupLock(lockClient, companyId);
    if (!lockAcquired) {
      throw new BackupInProgressError();
    }

    return await performBackup(companyId, triggeredBy);
  } finally {
    // Rilasciato solo se davvero acquisito: se acquireBackupLock ha
    // restituito false (lock già di un altro processo), non c'è nulla da
    // sbloccare per questa sessione — chiamarlo comunque darebbe solo un
    // warning innocuo lato Postgres, evitato controllando lockAcquired.
    if (lockAcquired) {
      try {
        await releaseBackupLock(lockClient, companyId);
      } catch (err) {
        console.error(`Impossibile rilasciare il lock di backup per l'azienda ${companyId}:`, err);
      }
    }
    lockClient.release();
  }
}

// 'pg_restore' di default (cercato nel PATH di sistema), stesso principio di
// pgDumpExecutable sopra: su Windows l'installer di PostgreSQL non aggiunge
// sempre la cartella bin al PATH.
function pgRestoreExecutable(): string {
  return process.env.PG_RESTORE_PATH || 'pg_restore';
}

// Ripristina il database allo stato di un backup passato. Prima sovrascrive
// qualunque cosa, crea uno snapshot 'pre-restore' dello stato ATTUALE (stesso
// lock, stessa sessione: vedi performBackup) così un ripristino richiesto per
// errore resta comunque reversibile con un secondo "Applica" su quello
// snapshot. --clean --if-exists: pg_restore droppa prima gli oggetti
// esistenti (altrimenti fallirebbe su tabelle/vincoli già presenti), --if-exists
// evita errori se lo schema corrente non combacia esattamente col dump.
export async function restoreBackup(companyId: string, backupId: string): Promise<void> {
  const lockClient = await pool.connect();
  let lockAcquired = false;
  try {
    lockAcquired = await acquireBackupLock(lockClient, companyId);
    if (!lockAcquired) {
      throw new BackupInProgressError();
    }

    const target = await findBackupRow(companyId, backupId);
    if (!target) {
      throw new BackupNotFoundError();
    }

    await performBackup(companyId, 'pre-restore', { skipRotation: true });

    const filePath = join(BACKUPS_DIR, target.filename);
    await execFileAsync(pgRestoreExecutable(), [
      '--dbname',
      requireDatabaseUrl(),
      '--clean',
      '--if-exists',
      '--no-owner',
      '--no-privileges',
      filePath,
    ]);

    const settings = await getOrCreateSettingsRow(companyId);
    await rotateOldBackups(companyId, settings.max_backups);
  } finally {
    if (lockAcquired) {
      try {
        await releaseBackupLock(lockClient, companyId);
      } catch (err) {
        console.error(`Impossibile rilasciare il lock di backup per l'azienda ${companyId}:`, err);
      }
    }
    lockClient.release();
  }
}

// Tick periodico invocato dallo scheduler node-cron (vedi server.ts): per
// ogni azienda con impostazioni proprie, controlla se interval_minutes è
// trascorso da last_backup_at (null = mai eseguito, quindi sempre dovuto) e
// in tal caso lancia un backup schedulato. Gli errori sono loggati per
// singola azienda, non propagati: un pg_dump fallito per un'azienda non deve
// impedire il controllo delle altre né far cadere il prossimo tick.
export async function runScheduledBackups(): Promise<void> {
  const { rows } = await pool.query<{ company_id: string; interval_minutes: number; last_backup_at: Date | null }>(
    'SELECT company_id, interval_minutes, last_backup_at FROM company_backup_settings',
  );

  for (const row of rows) {
    const dueAt = row.last_backup_at ? row.last_backup_at.getTime() + row.interval_minutes * 60_000 : 0;
    if (Date.now() < dueAt) continue;

    try {
      await runBackup(row.company_id, 'scheduled');
    } catch (err) {
      if (err instanceof BackupInProgressError) continue;
      console.error(`Backup schedulato fallito per l'azienda ${row.company_id}:`, err);
    }
  }
}
