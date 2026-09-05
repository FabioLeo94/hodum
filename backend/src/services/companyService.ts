import { randomUUID } from 'node:crypto';
import { DatabaseError } from 'pg';
import { pool } from '../db/pool';
import type { Company } from '../models/company';
import type { User } from '../models/user';
import { generateRecoveryCode, normalizeRecoveryCode } from '../utils/recoveryCode';
import { generateTemporaryPassword } from '../utils/temporaryPassword';
// Solo il tipo: exportService.ts importa a runtime getCompanyById da questo
// stesso modulo, quindi un import a runtime nella direzione opposta
// creerebbe un ciclo. `import type` viene eraso a compile time, nessun ciclo
// a runtime.
import type { CompanyExportData } from './exportService';
import { SLUG_TO_STATUS_NAME } from './taskService';
import { hashPassword, mapUserUniqueViolation, toUser, USER_COLUMNS, type UserRow } from './userService';

// Riga così come esce da pg per companies: snake_case, coerente con
// migrations/0013_create_companies_table.sql e
// 0030_add_dati_anagrafici_a_companies.sql. created_at arriva come Date
// (driver pg per timestamptz), stesso pattern di UserRow in userService.ts.
interface CompanyRow {
  id: string;
  name: string;
  owner_id: string;
  ragione_sociale: string | null;
  piva: string | null;
  codice_fiscale: string | null;
  indirizzo: string | null;
  pec: string | null;
  created_at: Date;
}

// Centralizzato come USER_COLUMNS in userService.ts: ogni query che deve
// restituire un CompanyRow completo (via toCompany) la riusa, invece di
// ripetere l'elenco colonne a rischio di disallineamento.
export const COMPANY_COLUMNS =
  'id, name, owner_id, ragione_sociale, piva, codice_fiscale, indirizzo, pec, created_at';

function toCompany(row: CompanyRow): Company {
  return {
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    ragioneSociale: row.ragione_sociale,
    piva: row.piva,
    codiceFiscale: row.codice_fiscale,
    indirizzo: row.indirizzo,
    pec: row.pec,
    createdAt: row.created_at.toISOString(),
  };
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
    // referenziato qui, non il contrario. I campi anagrafici (0030) restano
    // tutti null: si compilano dopo dal drawer "Modifica dati aziendali", non
    // fanno parte del flusso di registrazione.
    const companyResult = await client.query<CompanyRow>(
      `INSERT INTO companies (name, owner_id) VALUES ($1, $2) RETURNING ${COMPANY_COLUMNS}`,
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
  const result = await pool.query<CompanyRow>(`SELECT ${COMPANY_COLUMNS} FROM companies WHERE id = $1`, [id]);
  return result.rows[0] ? toCompany(result.rows[0]) : null;
}

export interface UpdateCompanyInput {
  name: string;
  ragioneSociale: string | null;
  piva: string | null;
  codiceFiscale: string | null;
  indirizzo: string | null;
  pec: string | null;
}

// Nessun controllo "riga trovata" separato: il chiamante (companyController)
// ha già verificato che id combaci con la company del richiedente autenticato
// prima di arrivare qui, stesso principio delle altre funzioni di questo
// service che ricevono un id già validato (es. createEmployee).
export async function updateCompany(id: string, input: UpdateCompanyInput): Promise<Company> {
  const result = await pool.query<CompanyRow>(
    `UPDATE companies
     SET name = $2, ragione_sociale = $3, piva = $4, codice_fiscale = $5, indirizzo = $6, pec = $7
     WHERE id = $1
     RETURNING ${COMPANY_COLUMNS}`,
    [id, input.name, input.ragioneSociale, input.piva, input.codiceFiscale, input.indirizzo, input.pec],
  );
  return toCompany(result.rows[0]);
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

// Punto 3 del piano "Export/import e cancellazione completa di account e
// azienda": nessuna delle due FK incrociate companies.owner_id <-> users.company_id
// ha ON DELETE CASCADE (per design, vedi i commenti in
// migrations/0013_create_companies_table.sql e
// 0014_add_company_id_e_role_a_users.sql), quindi l'ordine sotto non è
// arbitrario:
// 1) i progetti dell'azienda, la cui cascata su tasks/task_comments/
//    task_assignments/project_assignments è già garantita da FK esistenti
//    (migrations 0007, 0010, 0020, 0024);
// 2) i dipendenti/manager (mai l'owner, escluso esplicitamente): le loro
//    notifiche/commenti/assegnazioni residue cascatano da sole;
// 3) si azzera company_id/role sull'owner PRIMA di eliminare la company:
//    finché users.company_id punta ancora a questa riga, DELETE FROM
//    companies fallirebbe con 23503 (foreign key violation);
// 4) si elimina la company (ora nessun utente vi fa più riferimento);
// 5) si elimina l'utente owner stesso, per ultimo perché companies.owner_id
//    lo referenziava fino al passo precedente.
// Stesso pattern transazionale di registerCompany sopra: un client dedicato,
// BEGIN/COMMIT, ROLLBACK nel catch, client.release() nel finally.
export async function deleteCompany(companyId: string, ownerId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM projects WHERE company_id = $1', [companyId]);
    await client.query('DELETE FROM users WHERE company_id = $1 AND id <> $2', [companyId, ownerId]);
    await client.query('UPDATE users SET company_id = NULL, role = NULL WHERE id = $1', [ownerId]);
    await client.query('DELETE FROM companies WHERE id = $1', [companyId]);
    await client.query('DELETE FROM users WHERE id = $1', [ownerId]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Credenziali generate per un utente importato (mai per l'owner, che sceglie
// la propria password fresca): mostrate una sola volta dal frontend, stesso
// principio del recoveryCode, e mai più recuperabili da qui (solo l'hash
// resta salvato).
export interface TemporaryPasswordEntry {
  username: string;
  role: 'employee' | 'manager';
  password: string;
}

export interface ImportCompanyInput {
  data: CompanyExportData;
  // Password scelta dall'owner per LA NUOVA istanza: mai importata alcuna
  // password/hash dal vecchio server, non esistono nell'export in primo
  // luogo (models/user.ts non espone mai la colonna password).
  ownerPassword: string;
}

export interface ImportCompanyResult {
  user: User;
  company: Company;
  recoveryCode: string;
  temporaryPasswords: TemporaryPasswordEntry[];
}

// Segnala un payload che ha già passato la validazione superficiale del
// controller (companyController.validateImportPayload) ma è comunque
// internamente incoerente (es. nessun utente con l'id di company.ownerId):
// non dovrebbe mai accadere con un payload prodotto da exportCompanyData, ma
// il service non deve assumerlo senza verificarlo.
export class ImportCompanyDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportCompanyDataError';
  }
}

// Punto 4 del piano: ricrea da zero un'azienda su un'istanza di destinazione
// a partire da un export prodotto da exportCompanyData, in un'unica
// transazione (tutto o niente, stesso pattern di registerCompany/deleteCompany
// sopra). Mappe id vecchio->nuovo tenute in memoria per soli utenti/progetti/
// task: sono le tre entità referenziate da altre righe che questa funzione
// reinserisce (project_assignments, task_assignments, task_comments).
export async function importCompanyData(input: ImportCompanyInput): Promise<ImportCompanyResult> {
  const { data, ownerPassword } = input;
  const ownerExport = data.users.find((u) => u.id === data.company.ownerId);
  if (!ownerExport) {
    throw new ImportCompanyDataError(
      "Payload di import non valido: nessun utente con id uguale a company.ownerId tra gli utenti esportati",
    );
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // --- Owner: stesso ordine di registerCompany (utente prima, company
    // dopo perché companies.owner_id è NOT NULL e lo referenzia, company_id/
    // role sull'utente per ultimo) -------------------------------------------
    const newOwnerId = randomUUID();
    const ownerPasswordHash = await hashPassword(ownerPassword);
    // Nuovo recovery code, mai quello vecchio: l'hash originale non è mai
    // stato esportato (stesso principio della password), quindi non esiste
    // nulla da riportare qui.
    const recoveryCode = generateRecoveryCode();
    const recoveryCodeHash = await hashPassword(normalizeRecoveryCode(recoveryCode));
    await client.query(
      'INSERT INTO users (id, username, email, password, recovery_code_hash) VALUES ($1, $2, $3, $4, $5)',
      [newOwnerId, ownerExport.username, ownerExport.email, ownerPasswordHash, recoveryCodeHash],
    );

    const companyResult = await client.query<CompanyRow>(
      `INSERT INTO companies (name, owner_id, ragione_sociale, piva, codice_fiscale, indirizzo, pec)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${COMPANY_COLUMNS}`,
      [
        data.company.name,
        newOwnerId,
        data.company.ragioneSociale,
        data.company.piva,
        data.company.codiceFiscale,
        data.company.indirizzo,
        data.company.pec,
      ],
    );
    const company = toCompany(companyResult.rows[0]);

    const ownerUserResult = await client.query<UserRow>(
      `UPDATE users SET company_id = $2, role = 'owner' WHERE id = $1 RETURNING ${USER_COLUMNS}`,
      [newOwnerId, company.id],
    );

    // --- Dipendenti/manager: id nuovo, password temporanea generata qui e
    // mai quella originale (mai esistita in chiaro lato server) --------------
    const userIdMap = new Map<string, string>([[ownerExport.id, newOwnerId]]);
    const temporaryPasswords: TemporaryPasswordEntry[] = [];
    for (const exportedUser of data.users) {
      if (exportedUser.id === ownerExport.id) continue;
      const newId = randomUUID();
      userIdMap.set(exportedUser.id, newId);
      // Il controller ha già validato che role sia 'employee' o 'manager' per
      // ogni utente diverso dall'owner: il fallback a 'employee' qui è solo
      // difensivo (role tipizzato UserRole | null in User).
      const role: 'employee' | 'manager' = exportedUser.role === 'manager' ? 'manager' : 'employee';
      const temporaryPassword = generateTemporaryPassword();
      const passwordHash = await hashPassword(temporaryPassword);
      // must_change_password = true esplicito, stesso comportamento di
      // createEmployee sopra: il dipendente deve sceglierne una propria al
      // primo accesso sulla nuova istanza.
      await client.query(
        `INSERT INTO users (id, username, email, password, company_id, role, must_change_password)
         VALUES ($1, $2, $3, $4, $5, $6, true)`,
        [newId, exportedUser.username, exportedUser.email, passwordHash, company.id, role],
      );
      temporaryPasswords.push({ username: exportedUser.username, role, password: temporaryPassword });
    }

    // --- Progetti: id generato dal database (projects.id ha DEFAULT
    // gen_random_uuid(), stesso pattern di createProject in projectService.ts) --
    const projectIdMap = new Map<string, string>();
    for (const exportedProject of data.projects) {
      const inserted = await client.query<{ id: string }>(
        'INSERT INTO projects (name, is_active, company_id) VALUES ($1, $2, $3) RETURNING id',
        [exportedProject.name, exportedProject.isActive, company.id],
      );
      projectIdMap.set(exportedProject.id, inserted.rows[0].id);
    }

    // --- project_assignments: remappa entrambi gli id, scarta silenziosamente
    // una coppia se uno dei due riferimenti non è stato ricreato sopra (payload
    // internamente incoerente, non dovrebbe accadere con un export genuino) ---
    for (const assignment of data.projectAssignments) {
      const newProjectId = projectIdMap.get(assignment.projectId);
      const newUserId = userIdMap.get(assignment.userId);
      if (!newProjectId || !newUserId) continue;
      await client.query('INSERT INTO project_assignments (project_id, user_id) VALUES ($1, $2)', [
        newProjectId,
        newUserId,
      ]);
    }

    // --- Task: creation_date NON viene passato esplicitamente, stesso
    // comportamento di createTask in taskService.ts (la colonna non è nemmeno
    // esposta dal modello Task, quindi non c'è nulla da preservare qui) ------
    const taskIdMap = new Map<string, string>();
    for (const exportedTask of data.tasks) {
      const newProjectId = projectIdMap.get(exportedTask.projectId);
      if (!newProjectId) continue;
      const statusName = SLUG_TO_STATUS_NAME[exportedTask.status];
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO tasks (project_id, title, description, status, priority, due_date)
         VALUES ($1, $2, $3, (SELECT id FROM task_status WHERE name = $4), $5, $6)
         RETURNING id`,
        [newProjectId, exportedTask.title, exportedTask.description, statusName, exportedTask.priority, exportedTask.dueDate],
      );
      const newTaskId = inserted.rows[0].id;
      taskIdMap.set(exportedTask.id, newTaskId);

      if (exportedTask.assignees.length > 0) {
        const newAssigneeIds = exportedTask.assignees
          .map((assignee) => userIdMap.get(assignee.id))
          .filter((id): id is string => id !== undefined);
        if (newAssigneeIds.length > 0) {
          await client.query(
            `INSERT INTO task_assignments (task_id, user_id)
             SELECT $1, uid FROM unnest($2::uuid[]) AS uid`,
            [newTaskId, newAssigneeIds],
          );
        }
      }
    }

    // --- Commenti: created_at preservato esplicitamente (task_comments.created_at
    // è DEFAULT now(), non GENERATED ALWAYS, quindi accetta un valore esplicito) -
    for (const exportedComment of data.comments) {
      const newTaskId = taskIdMap.get(exportedComment.taskId);
      const newAuthorId = userIdMap.get(exportedComment.authorId);
      if (!newTaskId || !newAuthorId) continue;
      await client.query(
        'INSERT INTO task_comments (task_id, author_id, body, created_at, edited) VALUES ($1, $2, $3, $4, $5)',
        [newTaskId, newAuthorId, exportedComment.body, exportedComment.createdAt, exportedComment.edited],
      );
    }

    await client.query('COMMIT');
    return {
      user: toUser(ownerUserResult.rows[0]),
      company,
      recoveryCode,
      temporaryPasswords,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    // username/email già in uso sull'istanza di destinazione (owner o un
    // dipendente importato): un conflitto fa fallire l'intero import
    // (rollback), non un import parziale, stesso principio di
    // registerCompany sopra.
    if (err instanceof DatabaseError && err.code === '23505') {
      throw mapUserUniqueViolation(err);
    }
    throw err;
  } finally {
    client.release();
  }
}
