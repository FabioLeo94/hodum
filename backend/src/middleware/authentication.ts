import type { Request } from 'express';
import type { User } from '../models/user';
import { getUserById, UserNotFoundError } from '../services/userService';
import { verifySessionToken } from '../services/tokenService';

// Modulo referenziato da tsoa.json (routes.authenticationModule): generato il
// codice delle rotte, tsoa invoca questa funzione per ogni @Security('jwt')
// incontrato. Il valore risolto NON viene iniettato automaticamente in un
// parametro del controller (a differenza di @Body/@Path): va letto da
// request.user, valorizzato qui prima di risolvere la promise (vedi
// getAuthenticatedUser più sotto e src/types/express.d.ts per il tipo).
export async function expressAuthentication(request: Request, securityName: string): Promise<User> {
  if (securityName !== 'jwt') {
    throw new Error(`Schema di sicurezza sconosciuto: ${securityName}`);
  }

  const header = request.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
  if (!token) {
    throw new Error('Token di sessione mancante');
  }

  const { sub } = verifySessionToken(token);

  try {
    const user = await getUserById(sub);
    request.user = user;
    return user;
  } catch (err) {
    if (err instanceof UserNotFoundError) {
      throw new Error('Utente della sessione non trovato', { cause: err });
    }
    throw err;
  }
}

// I controller protetti da @Security('jwt') leggono l'utente corrente da qui
// invece che da request.user direttamente, per non dover ripetere il check
// di presenza (garantita da expressAuthentication, ma non visibile al tipo).
export function getAuthenticatedUser(request: Request): User {
  if (!request.user) {
    throw new Error('Richiesta non autenticata: nessun utente risolto');
  }
  return request.user;
}
