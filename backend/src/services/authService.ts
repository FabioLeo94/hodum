import bcrypt from 'bcryptjs';
import { pool } from '../db/pool';
import type { User } from '../models/user';

// Stesso pattern di UserNotFoundError: il service non conosce HTTP, il
// controller intercetta e decide lo status (401). Messaggio generico di
// proposito: non deve rivelare se a essere sbagliata è l'email o la password.
export class InvalidCredentialsError extends Error {
  constructor() {
    super('Email o password non corretti');
    this.name = 'InvalidCredentialsError';
  }
}

interface UserRow {
  id: string;
  username: string;
  email: string;
  password: string;
  company_id: string | null;
  role: User['role'];
}

export async function login(email: string, password: string): Promise<User> {
  const result = await pool.query<UserRow>(
    'SELECT id, username, email, password, company_id, role FROM users WHERE email = $1',
    [email],
  );
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

  return { id: row.id, username: row.username, email: row.email, companyId: row.company_id, role: row.role };
}
