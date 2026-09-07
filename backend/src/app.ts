import cors from 'cors';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ValidateError } from '@tsoa/runtime';
import {
  AuthenticationError,
  AuthorizationError,
  expressAuthentication,
  PasswordChangeRequiredError,
  UserDisabledError,
} from './middleware/authentication';
import { RegisterRoutes } from './routes/routes';
import {
  CustomerNotFoundError,
  getInvoicePdfPath,
  InvoiceNotFoundError,
  MissingRateError,
  NoTasksSelectedError,
  previewInvoicePdf,
  regenerateMissingInvoicePdf,
  TaskNotBillableError,
  type TaskSelectionInput,
} from './services/invoiceService';
import { InvalidSessionTokenError } from './services/tokenService';
import { ValidationError } from './utils/validation';

// True solo per un errore di filesystem con code 'ENOENT' (readFile su un
// path che non esiste): stesso pattern già usato altrove nel backend per
// distinguere un tipo di errore specifico via `instanceof` prima di leggere
// una proprietà propria del tipo concreto (vedi `err instanceof DatabaseError
// && err.code === '23505'` in userService.ts/companyService.ts), qui con
// NodeJS.ErrnoException invece di DatabaseError.
function isEnoentError(err: unknown): boolean {
  return err instanceof Error && (err as NodeJS.ErrnoException).code === 'ENOENT';
}

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

  // Header di sicurezza standard (X-Content-Type-Options, X-Frame-Options,
  // ecc.): difesa in profondità anche dietro VPN, a costo zero. CSP disattivata
  // perché Scalar (mountDocs sotto) monta CSS/JS che una policy di default
  // bloccherebbe; da valutare una policy dedicata se /docs resta esposta oltre
  // il dev.
  app.use(helmet({ contentSecurityPolicy: false }));

  // POST /companies/import (companyController.ts) riceve l'intero export di
  // un'azienda (utenti, progetti, task, commenti): con aziende grandi può
  // superare facilmente il limite globale di 1mb sotto. Montato PRIMA del
  // parser globale e solo su questo path: express.json() (body-parser sotto)
  // salta silenziosamente il proprio parsing se req._body è già valorizzato
  // da un middleware precedente, quindi per questa unica rotta si applica il
  // limite più alto qui e il parser globale sotto diventa un no-op; per ogni
  // altra rotta questo middleware non scatta affatto (path non combaciante) e
  // resta in vigore solo il limite di 1mb.
  app.use('/companies/import', express.json({ limit: '20mb' }));

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

  // Log di avviso condiviso dai due limiter sotto: senza, un blocco per
  // brute-force reale passa silenzioso quanto un utente che ha solo sbagliato
  // la password due volte di troppo — non distinguibili senza un log.
  const logRateLimitHit =
    (route: string) =>
    (req: Request, res: Response): void => {
      console.warn(`[rate-limit] ${route} bloccato per IP ${req.ip}`);
      res.status(429).json({ message: 'Troppi tentativi, riprova più tardi' });
    };

  // Limite per IP sul login: senza, niente si oppone a un brute-force sulle
  // credenziali (aggravato dal fatto che GET /users, se mai raggiunto senza
  // auth, enumererebbe email valide da provare). Non applicato ad altre rotte:
  // sono tutte già dietro @Security('jwt'), che richiede un token valido
  // ottenibile solo passando da qui. Soglia a 20 (non 10): un utente che
  // sbaglia la password 2-3 volte di seguito non deve restare bloccato 15
  // minuti per un errore di battitura, la difesa reale resta il logging sotto.
  app.use(
    '/auth/login',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 20,
      standardHeaders: true,
      legacyHeaders: false,
      handler: logRateLimitHit('/auth/login'),
    }),
  );

  // Stesso limite di /auth/login, stesso motivo: anche se l'80 bit di entropia
  // del recovery code (utils/recoveryCode.ts) rende un brute-force già
  // impraticabile da solo, resta l'unica rotta pubblica che accetta un
  // segreto lato utente senza passare da qui — difesa in profondità, non
  // l'unica barriera.
  app.use(
    '/auth/recover-password',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 20,
      standardHeaders: true,
      legacyHeaders: false,
      handler: logRateLimitHit('/auth/recover-password'),
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

  // Streaming binario del PDF di pre-fattura: fuori da tsoa (che serializza i
  // valori di ritorno dei controller in JSON, scomodo per un Buffer) invece
  // di dentro un controller, stesso principio già applicato a /swagger.json
  // sopra. L'auth 'owner' non arriva gratis come nei controller tsoa
  // (@Security la applica il router generato): va replicata a mano
  // richiamando expressAuthentication, la stessa funzione che tsoa invoca
  // internamente per ogni @Security(...) (vedi middleware/authentication.ts).
  // Montata prima di RegisterRoutes, stesso principio di /swagger.json: se in
  // futuro un controller tsoa definisse un path in conflitto, l'ordine di
  // montaggio decide chi risponde per primo (qui non capita: il segmento
  // finale '/pdf' non esiste nelle rotte generate per 'invoices/{invoiceId}').
  app.get('/invoices/:invoiceId/pdf', (req: Request, res: Response, next: NextFunction) => {
    // req.params[...] è tipizzato string | string[] (un param con più
    // segmenti, es. un futuro '/*splat', può produrre un array): normalizzato
    // in una variabile locale, stesso principio già richiesto per req.query
    // (getter, mai riassegnabile) applicato qui ai path param.
    const invoiceId = req.params.invoiceId;
    if (typeof invoiceId !== 'string') {
      res.status(404).json({ message: 'Invoice non trovata' });
      return;
    }
    expressAuthentication(req, 'owner')
      .then(async (user) => {
        if (user.companyId === null) {
          res.status(404).json({ message: `Invoice con id ${invoiceId} non trovata` });
          return;
        }
        const companyId = user.companyId;
        const pdfPath = await getInvoicePdfPath(invoiceId, companyId);
        let buffer: Buffer;
        try {
          buffer = await readFile(pdfPath);
        } catch (fsErr) {
          if (!isEnoentError(fsErr)) {
            throw fsErr;
          }
          // pdf_path risultava valorizzato in DB (getInvoicePdfPath rigenera
          // già da sé il caso 'pending', quindi qui il path non è quello) ma
          // il file è comunque assente sul filesystem (rimosso a mano,
          // cartella backend/invoices/ ripulita): un'unica rigenerazione
          // on-demand, stessa logica del sentinel 'pending' ma forzata,
          // invece di arrendersi subito. Se anche questa fallisce, l'errore
          // risale al .catch sotto, che lo mappa a 404 invece di lasciarlo
          // cadere nel generico error handler a 500.
          const regeneratedPath = await regenerateMissingInvoicePdf(invoiceId, companyId);
          buffer = await readFile(regeneratedPath);
        }
        res.type('application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="fattura-${invoiceId}.pdf"`);
        res.send(buffer);
      })
      .catch((err: unknown) => {
        if (err instanceof InvoiceNotFoundError) {
          res.status(404).json({ message: err.message });
          return;
        }
        if (isEnoentError(err)) {
          // La rigenerazione on-demand sopra è già fallita (il file manca
          // ANCHE dopo averlo ricreato): 404 esplicito, coerente con "il
          // documento non è disponibile", invece di finire nel generico error
          // handler a 500 come prima di questo fix.
          res.status(404).json({ message: 'PDF non disponibile: rigenerazione fallita, riprovare più tardi.' });
          return;
        }
        // AuthenticationError/AuthorizationError/PasswordChangeRequiredError e
        // qualunque altro errore imprevisto passano dall'error handler
        // globale a QUATTRO parametri sotto (401/403/428/500 a seconda del
        // tipo): stesso ciclo di gestione di ogni rotta tsoa, non un ramo
        // separato che dovrebbe reimplementarne la logica qui.
        next(err);
      });
  });

  // Anteprima PDF di una pre-fattura NON ancora generata (task 13 del
  // backlog UI): stesso motivo fuori-da-tsoa della rotta GET .../pdf sopra
  // (Buffer, non JSON), ma POST perché la selezione dei task viaggia nel
  // body, esattamente come CustomerInvoiceController.generateInvoice in
  // invoiceController.ts (di cui questa rotta è la sorella "sola lettura,
  // niente persistenza"). req.body è già disponibile qui: express.json()
  // globale (sopra, limite 1mb) gira prima di questa rotta.
  app.post('/customers/:customerId/invoices/preview', (req: Request, res: Response, next: NextFunction) => {
    const customerId = req.params.customerId;
    if (typeof customerId !== 'string') {
      res.status(404).json({ message: 'Customer non trovato' });
      return;
    }
    expressAuthentication(req, 'owner')
      .then(async (user) => {
        if (user.companyId === null) {
          res.status(404).json({ message: `Customer con id ${customerId} non trovato` });
          return;
        }
        // Stessa validazione "non vuoto" del controller generateInvoice
        // (tsoa valida solo la forma, non il dominio): qui non c'è tsoa a
        // valorizzare req.body dal DTO, va letto e controllato a mano.
        const body = req.body as { taskSelections?: unknown };
        if (!Array.isArray(body.taskSelections) || body.taskSelections.length === 0) {
          res.status(422).json({ message: 'Seleziona almeno un task da fatturare' });
          return;
        }
        const selections: TaskSelectionInput[] = (body.taskSelections as Array<Record<string, unknown>>).map(
          (s) => ({
            taskId: String(s.taskId ?? ''),
            nonFatturabile: s.nonFatturabile === true,
          }),
        );

        const buffer = await previewInvoicePdf(user.companyId, customerId, selections);
        res.type('application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename="anteprima-pre-fattura.pdf"');
        res.send(buffer);
      })
      .catch((err: unknown) => {
        if (err instanceof CustomerNotFoundError) {
          res.status(404).json({ message: err.message });
          return;
        }
        if (err instanceof MissingRateError || err instanceof NoTasksSelectedError) {
          res.status(422).json({ message: err.message });
          return;
        }
        if (err instanceof TaskNotBillableError) {
          res.status(409).json({ message: err.message });
          return;
        }
        // Stesso principio del .catch della rotta PDF sopra: qualunque altro
        // errore (incluso AuthenticationError/AuthorizationError) passa
        // dall'error handler globale a quattro parametri.
        next(err);
      });
  });

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

    if (err instanceof ValidationError) {
      // Stesso status di ValidateError sopra, ma per le regole di dominio che
      // tsoa non può validare da solo (campo vuoto dopo trim, range numerici,
      // formati custom): centralizzato qui invece che ripetuto in ogni
      // controller (vedi utils/validation.ts), ogni service la lancia
      // all'inizio delle proprie funzioni di scrittura.
      res.status(422).json({ message: err.message });
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

    if (err instanceof UserDisabledError) {
      // Identità accertata (login con credenziali corrette, o token già
      // valido) ma l'account è bloccato: 423 Locked, distinto da 401/403/428
      // così il frontend può mostrare un messaggio dedicato invece di
      // "credenziali errate" o "permessi insufficienti".
      res.status(423).json({ message: err.message });
      return;
    }

    // Nessuna fuga di stack trace o messaggi del driver in produzione.
    const isProduction = process.env.NODE_ENV === 'production';
    const message = err instanceof Error ? err.message : 'Errore interno';
    res.status(500).json({ message: isProduction ? 'Errore interno' : message });
  });

  return app;
}
