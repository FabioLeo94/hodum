import jwt, { type JwtPayload } from 'jsonwebtoken';

// Durata del token di sessione: nessuna tabella di revoca (sessione stateless),
// il token resta valido fino a scadenza naturale anche dopo un logout lato client.
const TOKEN_TTL = '7d';

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
    decoded = jwt.verify(token, secret);
  } catch {
    throw new InvalidSessionTokenError();
  }

  if (typeof decoded === 'string' || typeof decoded.sub !== 'string') {
    throw new InvalidSessionTokenError();
  }
  return { sub: decoded.sub };
}
