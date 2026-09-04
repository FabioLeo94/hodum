import { randomUUID } from 'node:crypto';
import { DatabaseError } from 'pg';
import { pool } from '../db/pool';
import type { Company } from '../models/company';
import type { User } from '../models/user';
import { generateRecoveryCode, normalizeRecoveryCode } from '../utils/recoveryCode';
import { hashPassword, mapUserUniqueViolation, toUser, USER_COLUMNS, type UserRow } from './userService';

// Riga così come esce da pg per l'INSERT su companies: snake_case, coerente
// con migrations/0013_create_companies_table.sql.
interface CompanyRow {
  id: string;
  name: string;
  owner_id: string;
}

function toCompany(row: CompanyRow): Company {
  return { id: row.id, name: row.name, ownerId: row.owner_id };
}

export interface RegisterCompanyInput {
  companyName: string;
  username: string;
  email: string;
  password: string;
}

export interface RegisterCompanyResult {
  user: User;
  company: Company;
  // In chiaro, una volta sola: da qui in poi ne esiste solo l'hash
  // (recovery_code_hash, migrations/0027). Il chiamante (companyController)
  // lo restituisce nella risposta di registrazione e non è più recuperabile —
  // se l'owner lo perde, resta solo il flusso "password dimenticata" con
  // l'ultimo codice ancora valido, o nessuno se anche quello è già stato
  // consumato.
  recoveryCode: string;
}

export interface CreateEmployeeInput {
  username: string;
  email: string;
  password: string;
  // Assente = 'employee' (comportamento storico): vedi CreateEmployeeRequest
  // in companyController.ts.
  role?: 'employee' | 'manager';
}

// Punto 2 di .tasks/TASK.md: sostituisce il vecchio self-signup libero
// (POST /users, rimosso). Le tre scritture (user, company, aggiornamento di
// user con company_id/role) condividono un solo client di pool invece di
// pool.query indipendenti: senza una transazione, un fallimento a metà (es.
// l'UPDATE finale) lascerebbe un utente creato ma orfano di azienda e ruolo,
// uno stato che il resto del prodotto non sa gestire (companyId/role nullable
// esistono solo come stato transitorio "non ancora agganciato", non come
// esito valido di una registrazione completata).
export async function registerCompany(input: RegisterCompanyInput): Promise<RegisterCompanyResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // id generato lato applicativo: users.id non ha un DEFAULT nel DB (vedi
    // migrations/0002_baseline_schema_esistente.sql), a differenza di
    // companies.id che invece ce l'ha (0013).
    const userId = randomUUID();
    const passwordHash = await hashPassword(input.password);
    // Generato qui e non in un secondo momento: solo l'owner (creato da
    // registerCompany) ha mai un recovery code, mai i dipendenti/manager
    // creati da createEmployee sotto, che vengono invece resettati
    // dall'owner stesso (PUT /users/{id}, userController.ts).
    const recoveryCode = generateRecoveryCode();
    const recoveryCodeHash = await hashPassword(normalizeRecoveryCode(recoveryCode));
    await client.query(
      'INSERT INTO users (id, username, email, password, recovery_code_hash) VALUES ($1, $2, $3, $4, $5)',
      [userId, input.username, input.email, passwordHash, recoveryCodeHash],
    );

    // owner_id è NOT NULL su companies (0013): l'utente va creato prima e
    // referenziato qui, non il contrario.
    const companyResult = await client.query<CompanyRow>(
      'INSERT INTO companies (name, owner_id) VALUES ($1, $2) RETURNING id, name, owner_id',
      [input.companyName, userId],
    );
    const company = toCompany(companyResult.rows[0]);

    const userResult = await client.query<UserRow>(
      `UPDATE users SET company_id = $2, role = 'owner'
       WHERE id = $1
       RETURNING ${USER_COLUMNS}`,
      [userId, company.id],
    );

    await client.query('COMMIT');
    return { user: toUser(userResult.rows[0]), company, recoveryCode };
  } catch (err) {
    await client.query('ROLLBACK');
    // Solo lo username/email di users ha vincoli UNIQUE raggiungibili qui:
    // companies non ne ha ancora (nessun requisito di nome univoco nel task).
    if (err instanceof DatabaseError && err.code === '23505') {
      throw mapUserUniqueViolation(err);
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function getCompanyById(id: string): Promise<Company | null> {
  const result = await pool.query<CompanyRow>('SELECT id, name, owner_id FROM companies WHERE id = $1', [id]);
  return result.rows[0] ? toCompany(result.rows[0]) : null;
}

// Punto 3 di .tasks/TASK.md: crea un dipendente già agganciato alla company
// del chiamante (verificata dal controller). Un solo INSERT, a differenza di
// registerCompany: qui non c'è una company da creare né un utente da
// aggiornare in un secondo tempo, quindi niente transazione a più passi da
// far fallire a metà.
export async function createEmployee(companyId: string, input: CreateEmployeeInput): Promise<User> {
  const userId = randomUUID();
  const passwordHash = await hashPassword(input.password);

  try {
    // must_change_password = true esplicito (non il DEFAULT globale): un
    // dipendente/project manager riceve la password dall'owner e deve
    // sostituirla al primo accesso, a differenza dell'owner stesso
    // (registerCompany), che sceglie la propria password e resta a false via
    // DEFAULT.
    const result = await pool.query<UserRow>(
      `INSERT INTO users (id, username, email, password, company_id, role, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       RETURNING ${USER_COLUMNS}`,
      [userId, input.username, input.email, passwordHash, companyId, input.role ?? 'employee'],
    );
    return toUser(result.rows[0]);
  } catch (err) {
    if (err instanceof DatabaseError && err.code === '23505') {
      throw mapUserUniqueViolation(err);
    }
    throw err;
  }
}
