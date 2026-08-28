import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { PoolClient } from 'pg';
import { pool } from './pool';

// Runner custom invece di un tool come node-pg-migrate: il progetto non ha
// ancora nessuna dipendenza di build oltre a pg/dotenv e le migration che
// servono ora sono SQL puro senza necessità di down/rollback strutturati.
// Qui sotto ci sono ~80 righe che coprono ordinamento, transazione per file
// e idempotenza; se in futuro servisse rollback o migration generate da CLI,
// si valuta l'adozione di un tool dedicato senza che lo schema di stato
// (tabella schema_migrations) sia incompatibile con quella scelta.

const migrationsDir = join(__dirname, '..', '..', 'migrations');

// Marcatore che una migration mette come prima riga non vuota per dire al
// runner "non wrappare questo file in BEGIN/COMMIT". Serve per
// CREATE INDEX CONCURRENTLY (e VACUUM, CREATE DATABASE, ...): Postgres li
// rifiuta se girano dentro un blocco di transazione, esplicito o implicito
// (anche il protocollo "simple query" di libpq/pg apre un blocco implicito
// se il testo contiene più statement separati da ';'). Per questo un file
// con questo marcatore deve contenere UN SOLO statement.
const NO_TRANSACTION_MARKER = '-- no-transaction';

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

async function getAppliedFilenames(): Promise<Set<string>> {
  const { rows } = await pool.query<{ filename: string }>('SELECT filename FROM schema_migrations');
  return new Set(rows.map((r) => r.filename));
}

function listMigrationFiles(): string[] {
  return readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort(); // il prefisso numerico a larghezza fissa (0001, 0002, ...) rende l'ordine alfabetico l'ordine di applicazione.
}

function isNoTransaction(sql: string): boolean {
  const firstLine = sql.split('\n').find((line) => line.trim().length > 0) ?? '';
  return firstLine.trim() === NO_TRANSACTION_MARKER;
}

async function applyInTransaction(client: PoolClient, filename: string, sql: string): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

async function applyWithoutTransaction(client: PoolClient, filename: string, sql: string): Promise<void> {
  // Nessun BEGIN/COMMIT: se il file rispetta il vincolo di un solo statement,
  // pg lo invia come singolo comando e non lo avvolge in nessun blocco.
  await client.query(sql);
  await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
}

async function main(): Promise<void> {
  await ensureMigrationsTable();
  const applied = await getAppliedFilenames();
  const pending = listMigrationFiles().filter((f) => !applied.has(f));

  if (pending.length === 0) {
    console.log('Nessuna migration da applicare.');
    return;
  }

  const client = await pool.connect();
  try {
    for (const filename of pending) {
      const sql = readFileSync(join(migrationsDir, filename), 'utf-8');
      console.log(`Applico ${filename}...`);

      if (isNoTransaction(sql)) {
        await applyWithoutTransaction(client, filename, sql);
      } else {
        await applyInTransaction(client, filename, sql);
      }

      console.log(`OK ${filename}`);
    }
  } finally {
    client.release();
  }
}

main()
  .catch((err) => {
    console.error('Migrazione fallita:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    void pool.end();
  });
