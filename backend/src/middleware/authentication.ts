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

// Distinta sia da AuthenticationError (identità non accertata) sia da
// AuthorizationError (ruolo insufficiente): qui identità e ruolo vanno bene,
// ma l'utente ha must_change_password = true e non può usare NESSUNA rotta
// tranne quella dedicata al cambio password ('password-change' qui sotto).
// L'error handler globale (app.ts) la riconosce per rispondere 428, uno
// status distinto sia da 401 che da 403 per un futuro interceptor frontend.
export class PasswordChangeRequiredError extends Error {
  constructor() {
    super('Cambio password obbligatorio prima di continuare');
    this.name = 'PasswordChangeRequiredError';
  }
}

// Distinta dalle altre tre: qui non c'è nessuna via d'uscita lato utente (a
// differenza di PasswordChangeRequiredError, che lascia passare lo schema
// 'password-change'). Un utente con disabledAt valorizzato è bloccato su
// OGNI rotta, incluso il cambio password: solo l'owner può riabilitarlo
// (updateUser). Usata sia qui sia da authService.login, che la lancia prima
// ancora che esista un token di sessione. L'error handler globale (app.ts)
// la riconosce per rispondere 423 Locked, distinto da 401/403/428.
export class UserDisabledError extends Error {
  constructor() {
    super('Account disabilitato: contattare il titolare dell\'azienda');
    this.name = 'UserDisabledError';
  }
}

// Modulo referenziato da tsoa.json (routes.authenticationModule): generato il
// codice delle rotte, tsoa invoca questa funzione per ogni @Security(...)
// incontrato. Il valore risolto NON viene iniettato automaticamente in un
// parametro del controller (a differenza di @Body/@Path): va letto da
// request.user, valorizzato qui prima di risolvere la promise (vedi
// getAuthenticatedUser più sotto e src/types/express.d.ts per il tipo).
//
// Quattro schemi condividono questa stessa funzione (vedi tsoa.json
// securityDefinitions): 'jwt' risolve solo l'identità, 'owner' risolve
// l'identità E richiede role === 'owner', 'manager' richiede role === 'owner'
// OPPURE role === 'manager' (project manager: crea progetti/task e assegna
// progetti ai dipendenti, ma non gestisce le loro credenziali — quello resta
// dietro 'owner'), 'password-change' risolve la sola identità mai bloccando
// su must_change_password (è lo schema della rotta che lo azzera). Non sono
// funzioni separate perché la risoluzione del token/utente è identica in
// tutti i casi: solo il controllo finale cambia in base allo schema
// dichiarato dal controller con @Security(...).
export async function expressAuthentication(request: Request, securityName: string): Promise<User> {
  if (
    securityName !== 'jwt' &&
    securityName !== 'owner' &&
    securityName !== 'manager' &&
    securityName !== 'password-change'
  ) {
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

  // Controllo incondizionato, prima di ruolo e mustChangePassword: un utente
  // bloccato non deve poter usare NESSUNA rotta, nemmeno 'password-change'.
  if (user.disabledAt !== null) {
    throw new UserDisabledError();
  }

  if (securityName === 'owner' && user.role !== 'owner') {
    throw new AuthorizationError('Azione riservata al titolare dell\'azienda');
  }

  if (securityName === 'manager' && user.role !== 'owner' && user.role !== 'manager') {
    throw new AuthorizationError('Azione riservata al titolare o a un project manager dell\'azienda');
  }

  // Blocca ogni rotta protetta da 'jwt'/'owner' finché la password non viene
  // cambiata, TRANNE quella dichiarata con 'password-change' (che serve
  // esattamente ad azzerare must_change_password: bloccarla anche lì
  // creerebbe un vicolo cieco senza uscita per l'utente).
  if (securityName !== 'password-change' && user.mustChangePassword) {
    throw new PasswordChangeRequiredError();
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
