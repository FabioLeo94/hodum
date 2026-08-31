import type { User } from '../models/user';

// Valorizzato da expressAuthentication (src/middleware/authentication.ts) per
// ogni richiesta autenticata con successo tramite @Security('jwt').
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export {};
