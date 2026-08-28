import 'dotenv/config';
import { Pool } from 'pg';

// Caricato anche qui (oltre che in server.ts) perché questo modulo viene
// importato pure da script CLI a sé stanti (migrate, db:check) che non
// passano da server.ts. dotenv.config() non sovrascrive variabili già
// impostate nell'ambiente, quindi la doppia chiamata è innocua.

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  // Fallire subito e in modo leggibile: senza questo, il primo errore visto
  // sarebbe un ECONNREFUSED contro localhost:5432 (default di pg), fuorviante
  // rispetto al vero problema (variabile mancante).
  throw new Error(
    'DATABASE_URL non impostata. Copia .env.example in .env e valorizzala prima di avviare il server o gli script db:*.',
  );
}

export const pool = new Pool({ connectionString });

// Un errore su un client inattivo nel pool (es. connessione persa lato server
// Postgres) non deve far crashare il processo Node senza log: pg emette
// 'error' sul pool proprio per intercettarlo qui.
pool.on('error', (err) => {
  console.error('Errore inatteso su un client del pool PostgreSQL:', err);
});
