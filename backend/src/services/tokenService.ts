import jwt, { type JwtPayload } from 'jsonwebtoken';

// Durata del token di sessione: nessuna tabella di revoca (sessione stateless),
// il token resta valido fino a scadenza naturale anche dopo un logout lato
// client. Accorciata da 7 giorni a 24 ore per ridurre la finestra di
// esposizione in caso di furto del token (es. tramite un futuro XSS, dato che
// è salvato in localStorage/sessionStorage, non in un cookie httpOnly): non
// elimina il problema strutturale, ma lo limita nel tempo. Nessun refresh
// automatico esiste ancora, quindi l'utente dovrà rifare il login più spesso
// di prima anche con "ricordami" attivo.
const TOKEN_TTL = '24h';

function requireSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      'JWT_SECRET non impostata. Copia .env.example in .env e valorizzala prima di avviare il server.',
    );
  }
  return secret;
}

const secret = requireSecret();

export interface SessionTokenPayload {
  sub: string;
}

export function signSessionToken(userId: string): string {
  return jwt.sign({ sub: userId }, secret, { expiresIn: TOKEN_TTL });
}

// Stesso pattern di InvalidCredentialsError in authService.ts: il service non
// conosce HTTP, chi lo chiama decide lo status (401).
export class InvalidSessionTokenError extends Error {
  constructor() {
    super('Token di sessione non valido o scaduto');
    this.name = 'InvalidSessionTokenError';
  }
}

export function verifySessionToken(token: string): SessionTokenPayload {
  let decoded: string | JwtPayload;
  try {
    // algorithms esplicito: senza, jwt.verify accetterebbe qualunque
    // algoritmo dichiarato nell'header del token stesso invece di imporre
    // quello con cui firmiamo (allowlist esplicita, hardening standard contro
    // un token costruito con un algoritmo diverso da quello atteso).
    decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
  } catch {
    throw new InvalidSessionTokenError();
  }

  if (typeof decoded === 'string' || typeof decoded.sub !== 'string') {
    throw new InvalidSessionTokenError();
  }
  return { sub: decoded.sub };
}
