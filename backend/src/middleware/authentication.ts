import type { Request } from 'express';
import type { User } from '../models/user';
import { getUserById, UserNotFoundError } from '../services/userService';
import { verifySessionToken } from '../services/tokenService';

// Distinta da un errore generico: l'error handler globale (app.ts) la
// riconosce per rispondere 401 invece del 500 di default, che altrimenti
// scatterebbe per qualunque errore non tipizzato e rischierebbe di esporre
// messaggi interni quando NODE_ENV non è impostato a "production".
export class AuthenticationError extends Error {}

// Distinta da AuthenticationError: qui il token è valido e l'utente esiste
// (l'identità non è in discussione), ma il suo ruolo non basta per l'azione
// richiesta. L'error handler globale (app.ts) la riconosce per rispondere 403
// invece di 401, coerente con la semantica HTTP (401 = non autenticato,
// 403 = autenticato ma non autorizzato).
export class AuthorizationError extends Error {}

// Modulo referenziato da tsoa.json (routes.authenticationModule): generato il
// codice delle rotte, tsoa invoca questa funzione per ogni @Security(...)
// incontrato. Il valore risolto NON viene iniettato automaticamente in un
// parametro del controller (a differenza di @Body/@Path): va letto da
// request.user, valorizzato qui prima di risolvere la promise (vedi
// getAuthenticatedUser più sotto e src/types/express.d.ts per il tipo).
//
// Due schemi condividono questa stessa funzione (vedi tsoa.json
// securityDefinitions): 'jwt' risolve solo l'identità, 'owner' risolve
// l'identità E richiede role === 'owner'. Non sono due funzioni separate
// perché la risoluzione del token/utente è identica in entrambi i casi: solo
// il controllo finale sul ruolo cambia in base allo schema dichiarato dal
// controller con @Security('jwt') / @Security('owner').
export async function expressAuthentication(request: Request, securityName: string): Promise<User> {
  if (securityName !== 'jwt' && securityName !== 'owner') {
    throw new Error(`Schema di sicurezza sconosciuto: ${securityName}`);
  }

  const header = request.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
  if (!token) {
    throw new AuthenticationError('Token di sessione mancante');
  }

  const { sub } = verifySessionToken(token);

  let user: User;
  try {
    user = await getUserById(sub);
  } catch (err) {
    if (err instanceof UserNotFoundError) {
      throw new AuthenticationError('Utente della sessione non trovato');
    }
    throw err;
  }

  if (securityName === 'owner' && user.role !== 'owner') {
    throw new AuthorizationError('Azione riservata al titolare dell\'azienda');
  }

  request.user = user;
  return user;
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
