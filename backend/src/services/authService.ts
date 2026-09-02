import bcrypt from 'bcryptjs';
import { pool } from '../db/pool';
import type { User } from '../models/user';
import { toUser, USER_COLUMNS, type UserRow } from './userService';

// Stesso pattern di UserNotFoundError: il service non conosce HTTP, il
// controller intercetta e decide lo status (401). Messaggio generico di
// proposito: non deve rivelare se a essere sbagliata è l'email o la password.
export class InvalidCredentialsError extends Error {
  constructor() {
    super('Email o password non corretti');
    this.name = 'InvalidCredentialsError';
  }
}

export async function login(email: string, password: string): Promise<User> {
  const result = await pool.query<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE email = $1`, [email]);
  const row = result.rows[0];
  if (!row) {
    // Stesso errore generico di "password sbagliata": una email inesistente
    // non deve essere distinguibile da una password errata (user enumeration).
    throw new InvalidCredentialsError();
  }

  const passwordMatches = await bcrypt.compare(password, row.password);
  if (!passwordMatches) {
    throw new InvalidCredentialsError();
  }

  // "Ping" di ultimo accesso (task "Modifica account"): un solo UPDATE per
  // primary key, nella stessa chiamata di login invece di un endpoint
  // dedicato — il modo più leggero di tenere last_login_at aggiornato senza
  // una richiesta HTTP in più dal client. RETURNING invece di un secondo
  // SELECT: evita una terza query per ottenere il valore appena scritto.
  const updated = await pool.query<UserRow>(
    `UPDATE users SET last_login_at = now() WHERE id = $1 RETURNING ${USER_COLUMNS}`,
    [row.id],
  );
  return toUser(updated.rows[0]);
}
