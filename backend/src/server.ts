// Side-effect import, deve restare la prima riga del file: carica .env in
// process.env prima che qualunque altro modulo (incluso createApp e tutto
// ciò che importa) legga una variabile d'ambiente.
import 'dotenv/config';

import { createApp } from './app';

const port = Number(process.env.PORT) || 3000;

async function main(): Promise<void> {
  const app = await createApp();

  const server = app.listen(port, () => {
    console.log(`Server in ascolto su http://localhost:${port}`);
    console.log(`Documentazione su http://localhost:${port}/docs`);
  });

  // Spegnimento ordinato: smettiamo di accettare nuove connessioni e usciamo
  // solo quando quelle in corso sono state chiuse. Se in futuro si aggiungono
  // risorse con connessioni aperte (pool DB, code, client esterni), vanno
  // chiuse qui, dopo server.close() e prima di process.exit().
  function shutdown(signal: NodeJS.Signals): void {
    console.log(`Ricevuto ${signal}, arresto in corso...`);
    server.close((err) => {
      if (err) {
        console.error('Errore durante la chiusura del server:', err);
        process.exit(1);
      }
      process.exit(0);
    });
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Avvio del server fallito:', err);
  process.exit(1);
});
