// Side-effect import, deve restare la prima riga del file: carica .env in
// process.env prima che qualunque altro modulo (incluso createApp e tutto
// ciò che importa) legga una variabile d'ambiente.
import 'dotenv/config';

import cron from 'node-cron';
import { createApp } from './app';
import { initRealtime } from './realtime/io';
import { checkDueDateNotifications } from './services/notificationService';
import { runScheduledBackups } from './services/backupService';

const port = Number(process.env.PORT) || 3000;

async function main(): Promise<void> {
  const app = await createApp();

  const server = app.listen(port, () => {
    console.log(`Server in ascolto su http://localhost:${port}`);
    console.log(`Documentazione su http://localhost:${port}/docs`);
  });

  // Sopra lo stesso http.Server di Express: stesso host:porta dell'API REST,
  // nessuna configurazione aggiuntiva richiesta al client.
  initRealtime(server);

  // Job periodico "promemoria scadenza": nessuna libreria di cron nel
  // progetto (package.json non ne ha), setInterval basta per una cadenza
  // oraria. checkDueDateNotifications gestisce già i propri errori per task
  // (console.error, mai un throw), il .catch qui è solo una rete di
  // sicurezza per un eventuale errore sfuggito a quel livello: senza,
  // diventerebbe una promise rejection non gestita nel callback di
  // setInterval e abbatterebbe il processo.
  const dueDateCheckInterval = setInterval(() => {
    checkDueDateNotifications().catch((err) => console.error('Controllo scadenze notifiche fallito', err));
  }, 60 * 60 * 1000);
  // Un giro subito all'avvio: senza, le scadenze già passate al momento del
  // riavvio del server aspetterebbero fino a un'ora prima del primo avviso.
  void checkDueDateNotifications().catch((err) => console.error('Controllo scadenze notifiche fallito', err));

  // Tick "ogni minuto, controlla se qualche azienda ha superato il proprio
  // interval_minutes da last_backup_at" (vedi backupService.runScheduledBackups):
  // node-cron invece del setInterval usato sopra perché qui la cadenza è
  // dichiarata dall'owner stesso tramite le impostazioni di backup, un
  // contesto dove un'espressione cron è il formato naturale, anche se il tick
  // di controllo resta fisso al minuto (la vera cadenza per azienda è
  // calcolata dentro runScheduledBackups, non dall'espressione cron qui).
  const backupTask = cron.schedule('* * * * *', () => {
    runScheduledBackups().catch((err) => console.error('Controllo backup schedulati fallito', err));
  });
  void runScheduledBackups().catch((err) => console.error('Controllo backup schedulati fallito', err));

  // Spegnimento ordinato: smettiamo di accettare nuove connessioni e usciamo
  // solo quando quelle in corso sono state chiuse. Se in futuro si aggiungono
  // risorse con connessioni aperte (pool DB, code, client esterni), vanno
  // chiuse qui, dopo server.close() e prima di process.exit().
  function shutdown(signal: NodeJS.Signals): void {
    console.log(`Ricevuto ${signal}, arresto in corso...`);
    clearInterval(dueDateCheckInterval);
    backupTask.stop();
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
