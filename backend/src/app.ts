import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ValidateError } from 'tsoa';
import { RegisterRoutes } from './routes/routes';

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

  // Limite esplicito: senza, un body enorme è un DoS a costo zero per il client.
  app.use(express.json({ limit: '1mb' }));

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

    // Nessuna fuga di stack trace o messaggi del driver in produzione.
    const isProduction = process.env.NODE_ENV === 'production';
    const message = err instanceof Error ? err.message : 'Errore interno';
    res.status(500).json({ message: isProduction ? 'Errore interno' : message });
  });

  return app;
}
