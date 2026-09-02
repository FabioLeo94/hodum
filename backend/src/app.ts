import cors from 'cors';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ValidateError } from 'tsoa';
import { AuthenticationError, AuthorizationError, PasswordChangeRequiredError } from './middleware/authentication';
import { RegisterRoutes } from './routes/routes';
import { InvalidSessionTokenError } from './services/tokenService';

// `@scalar/express-api-reference` è distribuito come puro ESM ("type": "module",
// nessuna condizione "require" in "exports"). Node 24 sa caricare ESM da un
// require() a runtime, ma tsc con module=Node16/NodeNext non lo modella e
// rifiuta lo static import (TS1479): da qui l'import() dinamico, come
// suggerito dallo stesso errore del compilatore.
async function mountDocs(app: Express): Promise<void> {
  const { apiReference } = await import('@scalar/express-api-reference');
  app.use('/docs', apiReference({ url: '/swagger.json' }));
}

export async function createApp(): Promise<Express> {
  const app = express();
  // Senza, ogni risposta espone "X-Powered-By: Express": informazione gratuita
  // per chi fa ricognizione sul framework in uso.
  app.disable('x-powered-by');

  // Limite esplicito: senza, un body enorme è un DoS a costo zero per il client.
  app.use(express.json({ limit: '1mb' }));

  // Origine esplicita (mai '*' con credenziali) letta da env con lo stesso
  // pattern di PORT in server.ts: fallback alla porta di default di Vite per
  // non richiedere configurazione in sviluppo locale.
  // exposedHeaders: senza, il browser scarta RateLimit-Reset dalla response
  // cross-origin del rate limiter sotto (non è nella lista CORS-safelisted di
  // default) e il frontend non saprebbe tra quanti secondi si può riprovare.
  app.use(
    cors({
      origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
      exposedHeaders: ['RateLimit-Reset'],
    }),
  );

  // Limite per IP sul login: senza, niente si oppone a un brute-force sulle
  // credenziali (aggravato dal fatto che GET /users, se mai raggiunto senza
  // auth, enumererebbe email valide da provare). Non applicato ad altre rotte:
  // sono tutte già dietro @Security('jwt'), che richiede un token valido
  // ottenibile solo passando da qui.
  app.use(
    '/auth/login',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 10,
      standardHeaders: true,
      legacyHeaders: false,
      message: { message: 'Troppi tentativi di accesso, riprova più tardi' },
    }),
  );

  // /docs e /swagger.json espongono la mappa completa delle rotte interne
  // (path, forma di request/response, quali richiedono 'owner'/'manager'):
  // informazione utile a chi sviluppa, ma superficie di ricognizione gratuita
  // per chi attacca in produzione. Stesso interruttore NODE_ENV già usato
  // dall'error handler sotto per lo stesso motivo (non esporre dettagli
  // interni fuori da sviluppo): se non impostata a "production", entrambe le
  // rotte restano montate come prima.
  if (process.env.NODE_ENV !== 'production') {
    // La spec viene generata da `npm run tsoa:gen` in build/swagger.json (gitignored).
    // Letta ad ogni richiesta (file piccolo, nessuna cache) così riflette l'ultima
    // generazione senza richiedere il riavvio del processo in sviluppo.
    const specPath = join(__dirname, '..', 'build', 'swagger.json');

    app.get('/swagger.json', (_req: Request, res: Response) => {
      try {
        res.type('application/json').send(readFileSync(specPath, 'utf-8'));
      } catch {
        res
          .status(500)
          .json({ message: 'Spec OpenAPI non trovata: esegui "npm run tsoa:gen" prima di avviare il server.' });
      }
    });

    // Scalar va montato prima di RegisterRoutes: se in futuro un controller TSOA
    // definisse una rotta generica che potrebbe intercettare /docs, l'ordine di
    // montaggio decide chi risponde per primo.
    await mountDocs(app);
  }

  RegisterRoutes(app);

  // 404 esplicito: senza, una rotta inesistente cade nell'handler di default di
  // Express (pagina HTML) invece di una risposta coerente con il resto dell'API.
  app.use((req: Request, res: Response) => {
    res.status(404).json({ message: `Rotta non trovata: ${req.method} ${req.originalUrl}` });
  });

  // Error handler a QUATTRO parametri: con tre, Express lo registra come
  // middleware normale e nessun errore ci arriva mai qui.
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    // Se una risposta è già partita, non possiamo più scriverne una seconda:
    // deleghiamo all'error handler di default di Express, che chiude il socket.
    if (res.headersSent) {
      next(err);
      return;
    }

    if (err instanceof ValidateError) {
      // err.fields descrive quali campi non hanno passato la validazione tsoa:
      // è informazione di dominio, non uno stack trace o un dettaglio del driver.
      res.status(422).json({ message: 'Validazione della richiesta fallita', details: err.fields });
      return;
    }

    if (err instanceof AuthenticationError || err instanceof InvalidSessionTokenError) {
      // Prima di questa correzione qualunque fallimento di autenticazione
      // (token assente, scaduto, manomesso, utente non più esistente) cadeva
      // nel ramo 500 sotto: semanticamente sbagliato (401 è lo status
      // corretto) e, se NODE_ENV non è impostato a "production", esponeva il
      // messaggio interno di expressAuthentication invece di un errore
      // generico.
      res.status(401).json({ message: err.message });
      return;
    }

    if (err instanceof AuthorizationError) {
      // Identità accertata (401 non si applica) ma ruolo insufficiente: 403.
      res.status(403).json({ message: err.message });
      return;
    }

    if (err instanceof PasswordChangeRequiredError) {
      // Identità e ruolo accertati (401/403 non si applicano), ma
      // must_change_password è true: 428 Precondition Required, distinto da
      // un 403 generico così un futuro interceptor frontend può reagire
      // reindirizzando al cambio password invece che a un errore di permessi.
      res.status(428).json({ message: err.message });
      return;
    }

    // Nessuna fuga di stack trace o messaggi del driver in produzione.
    const isProduction = process.env.NODE_ENV === 'production';
    const message = err instanceof Error ? err.message : 'Errore interno';
    res.status(500).json({ message: isProduction ? 'Errore interno' : message });
  });

  return app;
}
