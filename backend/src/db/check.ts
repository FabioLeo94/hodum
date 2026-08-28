import { pool } from './pool';

// Script diagnostico manuale (npm run db:check): non è un endpoint applicativo,
// serve solo a confermare da riga di comando che DATABASE_URL è valorizzata
// correttamente e che Postgres è raggiungibile con quelle credenziali.
async function main(): Promise<void> {
  const { rows } = await pool.query<{ now: Date }>('SELECT NOW()');
  console.log('Connessione al database riuscita. Ora del server:', rows[0].now);
}

main()
  .catch((err) => {
    console.error('Connessione al database fallita:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    void pool.end();
  });
