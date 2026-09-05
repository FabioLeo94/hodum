import bcrypt from 'bcryptjs';
import { DatabaseError } from 'pg';
import { pool } from '../db/pool';
import type { User, UserRole } from '../models/user';
import { emitUserUpdated } from '../realtime/io';
import { assertNonEmpty } from '../utils/validation';

// Cost factor per bcrypt: 12 round è il compromesso standard attuale tra
// resistenza a brute-force e tempo di hashing lato server.
const BCRYPT_COST_FACTOR = 12;

// Esportata per companyService.ts: la registrazione "crea la tua azienda"
// crea uno user (l'owner) con lo stesso standard di hashing usato qui,
// senza duplicare il cost factor in due moduli.
export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST_FACTOR);
}

// Stesso pattern di ProjectNotFoundError: il service non conosce HTTP, il
// controller intercetta e decide lo status (404).
export class UserNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`User con id ${id} non trovato`);
    this.name = 'UserNotFoundError';
  }
}

// Violazione dei vincoli UNIQUE su username/email (Postgres 23505). Il
// controller la intercetta e risponde 409, non 500: è un conflitto di
// dominio, non un errore interno.
export class UserConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserConflictError';
  }
}

// users_unique -> UNIQUE(username), users_unique_1 -> UNIQUE(email), come da
// migrations/0002_baseline_schema_esistente.sql. Esportata per companyService.ts,
// che inserisce nella stessa tabella users e può incontrare la stessa 23505.
export function mapUserUniqueViolation(err: DatabaseError): UserConflictError {
  if (err.constraint === 'users_unique') {
    return new UserConflictError('username già in uso');
  }
  if (err.constraint === 'users_unique_1') {
    return new UserConflictError('email già in uso');
  }
  return new UserConflictError('Violazione di un vincolo di unicità su username o email');
}

// Forma della riga così come esce da pg: snake_case, include la password
// (hash) che invece non esce mai da questo modulo verso il controller.
// Esportata (con toUser sotto) per companyService.ts, che nella stessa
// transazione legge/scrive righe users con questa identica forma.
export interface UserRow {
  id: string;
  username: string;
  email: string;
  password: string;
  company_id: string | null;
  role: UserRole | null;
  must_change_password: boolean;
  created_at: Date;
  last_login_at: Date | null;
}

export function toUser(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    companyId: row.company_id,
    role: row.role,
    mustChangePassword: row.must_change_password,
    createdAt: row.created_at.toISOString(),
    lastLoginAt: row.last_login_at ? row.last_login_at.toISOString() : null,
  };
}

// Esportata per companyService.ts e authService.ts, che leggono/scrivono la
// stessa tabella users e devono restituire un UserRow completo (via toUser)
// senza duplicare qui l'elenco colonne a rischio di disallineamento.
export const USER_COLUMNS =
  'id, username, email, password, company_id, role, must_change_password, created_at, last_login_at';

// companyId omesso (undefined) per usi interni che devono vedere tutti gli
// utenti; il controller lo valorizza sempre con l'azienda del richiedente
// (vedi userController.ts), stesso pattern opzionale di projectService.ts.
export async function listUsers(companyId?: string | null): Promise<User[]> {
  if (companyId === undefined) {
    const result = await pool.query<UserRow>(`SELECT ${USER_COLUMNS} FROM users ORDER BY username`);
    return result.rows.map(toUser);
  }
  const result = await pool.query<UserRow>(
    `SELECT ${USER_COLUMNS} FROM users WHERE company_id = $1 ORDER BY username`,
    [companyId],
  );
  return result.rows.map(toUser);
}

export async function getUserById(id: string): Promise<User> {
  const result = await pool.query<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [id]);
  const row = result.rows[0];
  if (!row) {
    throw new UserNotFoundError(id);
  }
  return toUser(row);
}

export interface UpdateUserInput {
  username?: string;
  email?: string;
  password?: string;
  // Promozione/retrocessione project manager <-> dipendente (task "Ruolo
  // project manager"): il controller lo valorizza solo quando l'owner
  // modifica un proprio dipendente, mai nel self-service, quindi qui basta
  // applicarlo con lo stesso COALESCE degli altri campi opzionali.
  role?: UserRole;
  // Task "Gestione del dipendente": quando l'owner resetta la password di un
  // dipendente, questo deve tornare a true (stesso comportamento della
  // creazione, vedi createEmployee in companyService.ts) — a differenza del
  // cambio password self-service, dove l'owner/dipendente sceglie la propria
  // nuova password e non c'è nulla da forzare di nuovo. Ignorato se password
  // non è fornito.
  forceChangePassword?: boolean;
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<User> {
  // Punto 2 della code review "niente logica nei controller": prima un
  // controllo identico in userController.updateUser, solo se il chiamante ha
  // effettivamente toccato il campo (un PUT parziale può ometterlo).
  if (input.username !== undefined) {
    assertNonEmpty(input.username, 'username');
  }

  // La password va ri-hashata prima di entrare nella query: COALESCE non può
  // saperlo, quindi se non fornita passiamo null e la colonna resta invariata,
  // esattamente come per gli altri campi opzionali.
  const passwordHash = input.password !== undefined ? await hashPassword(input.password) : null;
  // true solo quando esplicitamente richiesto (reset password da owner): negli
  // altri casi (incluso il self-service change password via questo stesso
  // endpoint) COALESCE lascia must_change_password invariato, non lo forza a
  // false, per non introdurre un effetto collaterale non richiesto dal task.
  const mustChangePassword = input.forceChangePassword ? true : null;

  try {
    const result = await pool.query<UserRow>(
      `UPDATE users
       SET username = COALESCE($2, username), email = COALESCE($3, email), password = COALESCE($4, password),
           must_change_password = COALESCE($5, must_change_password), role = COALESCE($6, role)
       WHERE id = $1
       RETURNING ${USER_COLUMNS}`,
      [id, input.username ?? null, input.email ?? null, passwordHash, mustChangePassword, input.role ?? null],
    );
    const row = result.rows[0];
    if (!row) {
      throw new UserNotFoundError(id);
    }
    const user = toUser(row);
    // Task "aggiornamento ruolo in tempo reale": senza questo evento un
    // dipendente promosso/retrocesso dall'owner (o con altri dati toccati)
    // vede la propria UI aggiornarsi solo alla prossima riconnessione/login,
    // perché il client aggiorna lo user in storage in risposta alla PROPRIA
    // richiesta, non a quella fatta da un altro utente (l'owner) sulla sua
    // riga. Va sempre a una sola room personale (vedi emitUserUpdated), mai
    // in broadcast di company: nessun collega deve poter dedurre ruolo o
    // mustChangePassword altrui dal semplice fatto di essere connesso.
    emitUserUpdated(user);
    return user;
  } catch (err) {
    if (err instanceof DatabaseError && err.code === '23505') {
      throw mapUserUniqueViolation(err);
    }
    throw err;
  }
}

// Endpoint dedicato al cambio password (task "cambio password obbligatorio al
// primo accesso"): a differenza di updateUser, azzera sempre
// must_change_password nella stessa UPDATE, così un dipendente che cambia la
// password ricevuta dall'owner smette immediatamente di essere bloccato dal
// terzo securityName in expressAuthentication.
export async function changePassword(id: string, password: string): Promise<User> {
  const passwordHash = await hashPassword(password);
  const result = await pool.query<UserRow>(
    `UPDATE users SET password = $2, must_change_password = false WHERE id = $1 RETURNING ${USER_COLUMNS}`,
    [id, passwordHash],
  );
  const row = result.rows[0];
  if (!row) {
    throw new UserNotFoundError(id);
  }
  return toUser(row);
}

export async function deleteUser(id: string): Promise<void> {
  const result = await pool.query('DELETE FROM users WHERE id = $1', [id]);
  if (result.rowCount === 0) {
    throw new UserNotFoundError(id);
  }
}
