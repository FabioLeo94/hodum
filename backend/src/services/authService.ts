import bcrypt from 'bcryptjs';
import { pool } from '../db/pool';
import type { User } from '../models/user';
import { generateRecoveryCode, normalizeRecoveryCode } from '../utils/recoveryCode';
import { hashPassword, toUser, USER_COLUMNS, type UserRow } from './userService';

// Stesso pattern di UserNotFoundError: il service non conosce HTTP, il
// controller intercetta e decide lo status (401). Messaggio generico di
// proposito: non deve rivelare se a essere sbagliata è l'email o la password.
export class InvalidCredentialsError extends Error {
  constructor() {
    super('Email o password non corretti');
    this.name = 'InvalidCredentialsError';
  }
}

// Stesso principio di InvalidCredentialsError: un messaggio generico, non
// distinto tra "email inconsistente", "email senza recovery code" (dipendenti/
// manager) e "codice sbagliato" — nessuno dei tre deve essere distinguibile
// dagli altri (user enumeration).
export class InvalidRecoveryCodeError extends Error {
  constructor() {
    super('Email o codice di recupero non validi');
    this.name = 'InvalidRecoveryCodeError';
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

export interface RecoverPasswordResult {
  user: User;
  // Il codice appena usato viene ruotato (single-use, come un backup code
  // TOTP): questo è il nuovo, restituito una sola volta allo stesso modo del
  // primo generato da companyService.registerCompany, e da mostrare
  // all'owner con lo stesso avviso "salvalo, non verrà mostrato di nuovo".
  recoveryCode: string;
}

// Unico modo di recuperare l'accesso per l'owner (in cima alla gerarchia
// aziendale, nessuno sopra di lui può resettargli la password come lui fa per
// un dipendente via PUT /users/{id}), senza dipendere da un invio email né da
// alcun servizio esterno — coerente con il vincolo "niente servizi esterni,
// privacy oriented" del progetto.
export async function recoverPassword(
  email: string,
  recoveryCode: string,
  newPassword: string,
): Promise<RecoverPasswordResult> {
  const result = await pool.query<UserRow & { recovery_code_hash: string | null }>(
    `SELECT ${USER_COLUMNS}, recovery_code_hash FROM users WHERE email = $1`,
    [email],
  );
  const row = result.rows[0];
  // recovery_code_hash null copre sia "email inesistente" sia "utente senza
  // recovery code" (dipendenti/manager, che non ne hanno mai uno): stesso
  // errore generico per entrambi, per lo stesso motivo di InvalidCredentialsError.
  if (!row || row.recovery_code_hash === null) {
    throw new InvalidRecoveryCodeError();
  }

  const codeMatches = await bcrypt.compare(normalizeRecoveryCode(recoveryCode), row.recovery_code_hash);
  if (!codeMatches) {
    throw new InvalidRecoveryCodeError();
  }

  const newRecoveryCode = generateRecoveryCode();
  const [passwordHash, recoveryCodeHash] = await Promise.all([
    hashPassword(newPassword),
    hashPassword(normalizeRecoveryCode(newRecoveryCode)),
  ]);

  // must_change_password portato a false (mai a true): a differenza del reset
  // fatto dall'owner su un dipendente (userService.updateUser,
  // forceChangePassword), qui è la stessa persona a scegliere consapevolmente
  // la propria nuova password, non c'è nulla da forzare a un secondo cambio.
  const updated = await pool.query<UserRow>(
    `UPDATE users SET password = $2, recovery_code_hash = $3, must_change_password = false
     WHERE id = $1 RETURNING ${USER_COLUMNS}`,
    [row.id, passwordHash, recoveryCodeHash],
  );

  return { user: toUser(updated.rows[0]), recoveryCode: newRecoveryCode };
}
