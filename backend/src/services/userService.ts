import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { DatabaseError } from 'pg';
import { pool } from '../db/pool';
import type { User } from '../models/user';

// Cost factor per bcrypt: 12 round è il compromesso standard attuale tra
// resistenza a brute-force e tempo di hashing lato server.
const BCRYPT_COST_FACTOR = 12;

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
// migrations/0002_baseline_schema_esistente.sql.
function toConflictError(err: DatabaseError): UserConflictError {
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
interface UserRow {
  id: string;
  username: string;
  email: string;
  password: string;
}

function toUser(row: UserRow): User {
  return { id: row.id, username: row.username, email: row.email };
}

export async function listUsers(): Promise<User[]> {
  const result = await pool.query<UserRow>('SELECT id, username, email, password FROM users ORDER BY username');
  return result.rows.map(toUser);
}

export async function getUserById(id: string): Promise<User> {
  const result = await pool.query<UserRow>('SELECT id, username, email, password FROM users WHERE id = $1', [id]);
  const row = result.rows[0];
  if (!row) {
    throw new UserNotFoundError(id);
  }
  return toUser(row);
}

export interface CreateUserInput {
  username: string;
  email: string;
  password: string;
}

export async function createUser(input: CreateUserInput): Promise<User> {
  // id generato lato applicativo: a differenza di projects.id, users.id non
  // ha un DEFAULT nel DB (vedi migrations/0002_baseline_schema_esistente.sql).
  const id = randomUUID();
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST_FACTOR);

  try {
    const result = await pool.query<UserRow>(
      'INSERT INTO users (id, username, email, password) VALUES ($1, $2, $3, $4) RETURNING id, username, email, password',
      [id, input.username, input.email, passwordHash],
    );
    return toUser(result.rows[0]);
  } catch (err) {
    if (err instanceof DatabaseError && err.code === '23505') {
      throw toConflictError(err);
    }
    throw err;
  }
}

export interface UpdateUserInput {
  username?: string;
  email?: string;
  password?: string;
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<User> {
  // La password va ri-hashata prima di entrare nella query: COALESCE non può
  // saperlo, quindi se non fornita passiamo null e la colonna resta invariata,
  // esattamente come per gli altri campi opzionali.
  const passwordHash = input.password !== undefined ? await bcrypt.hash(input.password, BCRYPT_COST_FACTOR) : null;

  try {
    const result = await pool.query<UserRow>(
      `UPDATE users
       SET username = COALESCE($2, username), email = COALESCE($3, email), password = COALESCE($4, password)
       WHERE id = $1
       RETURNING id, username, email, password`,
      [id, input.username ?? null, input.email ?? null, passwordHash],
    );
    const row = result.rows[0];
    if (!row) {
      throw new UserNotFoundError(id);
    }
    return toUser(row);
  } catch (err) {
    if (err instanceof DatabaseError && err.code === '23505') {
      throw toConflictError(err);
    }
    throw err;
  }
}

export async function deleteUser(id: string): Promise<void> {
  const result = await pool.query('DELETE FROM users WHERE id = $1', [id]);
  if (result.rowCount === 0) {
    throw new UserNotFoundError(id);
  }
}
