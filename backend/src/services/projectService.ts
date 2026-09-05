import { pool } from '../db/pool';
import type { Project } from '../models/project';
import { assertNonEmpty } from '../utils/validation';
import { isValidUuid } from '../utils/uuid';
import { emitProjectCreated, emitProjectDeleted, emitProjectUpdated } from '../realtime/io';
import { CustomerNotFoundError } from './customerService';

// Segnala "0 righe trovate/modificate" al chiamante senza che il service
// conosca HTTP: il controller la intercetta e decide lo status (404). Stessa
// classe usata sia per "id inesistente" sia per "id di un'altra azienda"
// (vedi companyId nelle query sotto): un progetto fuori dalla propria company
// deve risultare indistinguibile da uno che non esiste, non un 403 che
// confermerebbe la sua esistenza.
export class ProjectNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Project con id ${id} non trovato`);
    this.name = 'ProjectNotFoundError';
  }
}

// L'utente autenticato non ha ancora un'azienda (users.company_id è nullable,
// vedi migrations/0014_add_company_id_e_role_a_users.sql): i task 5/6 del
// task "Azienda multi-utente" (registrazione crea azienda, owner crea
// dipendenti) sono quelli che la valorizzano. Senza company non esiste un
// ambito in cui creare un progetto.
export class MissingCompanyError extends Error {
  constructor() {
    super("L'utente non è associato a nessuna azienda");
    this.name = 'MissingCompanyError';
  }
}

// Forma della riga così come esce da pg: snake_case, coerente con lo schema
// in migrations/0002_baseline_schema_esistente.sql. Esportata (con toProject
// sotto) per projectAssignmentService.ts, che restituisce Project[] a partire
// da una query diversa (JOIN su project_assignments) ma con la stessa forma di
// riga — stesso pattern già in uso da userService.ts con UserRow/toUser per
// companyService.ts.
export interface ProjectRow {
  id: string;
  name: string;
  is_active: boolean;
  customer_id: string | null;
}

export function toProject(row: ProjectRow): Project {
  return { id: row.id, name: row.name, isActive: row.is_active, customerId: row.customer_id };
}

// company_id dell'utente autenticato (getAuthenticatedUser(request).companyId
// nel controller): null finché l'utente non è agganciato a un'azienda, nel
// qual caso queste query non devono restituire nulla, non "tutti i progetti"
// (company_id su projects è NOT NULL, quindi `= NULL` non combacia mai).
//
// companyId resta un parametro opzionale (undefined) solo per usi interni che
// devono deliberatamente vedere tutte le company (nessuno oggi: sia
// taskService.ts sia assistantService.ts inoltrano sempre il companyId
// dell'utente autenticato fino a qui, chiudendo il varco cross-tenant di cui
// parlava questo commento — punto 4 del task "Guardia di autorizzazione
// trasversale", completato). Se in futuro compare una nuova chiamata che
// omette companyId, verificare che sia intenzionale e non una dimenticanza.
// assignedToUserId (task "Gestione del dipendente"): se presente, restringe
// ulteriormente ai soli progetti assegnati a quell'utente in
// project_assignments, tramite JOIN invece del semplice filtro su
// company_id — è il caso della dashboard di un dipendente, che deve vedere
// solo i progetti a lui assegnati, non tutti quelli della company.
export async function listProjects(companyId?: string | null, assignedToUserId?: string): Promise<Project[]> {
  if (assignedToUserId !== undefined) {
    const result = await pool.query<ProjectRow>(
      `SELECT p.id, p.name, p.is_active, p.customer_id FROM projects p
       JOIN project_assignments pa ON pa.project_id = p.id
       WHERE p.company_id = $1 AND pa.user_id = $2
       ORDER BY p.name`,
      [companyId, assignedToUserId],
    );
    return result.rows.map(toProject);
  }
  if (companyId === undefined) {
    const result = await pool.query<ProjectRow>('SELECT id, name, is_active, customer_id FROM projects ORDER BY name');
    return result.rows.map(toProject);
  }
  const result = await pool.query<ProjectRow>(
    'SELECT id, name, is_active, customer_id FROM projects WHERE company_id = $1 ORDER BY name',
    [companyId],
  );
  return result.rows.map(toProject);
}

export async function getProjectById(id: string, companyId?: string | null): Promise<Project> {
  // Un id sintatticamente non valido (es. un nome passato per errore invece
  // dell'uuid, come può capitare all'assistente LLM) non può comunque
  // combaciare con nessuna riga: intercettarlo qui evita che la colonna uuid
  // lo rifiuti con un errore del driver ("invalid input syntax for type
  // uuid"), che altrimenti uscirebbe come eccezione non gestita invece del
  // consueto ProjectNotFoundError già previsto da chi chiama questa funzione.
  if (!isValidUuid(id)) {
    throw new ProjectNotFoundError(id);
  }

  // Stesso companyId opzionale di listProjects: vedi il commento lì sopra.
  const result =
    companyId === undefined
      ? await pool.query<ProjectRow>('SELECT id, name, is_active, customer_id FROM projects WHERE id = $1', [id])
      : await pool.query<ProjectRow>(
          'SELECT id, name, is_active, customer_id FROM projects WHERE id = $1 AND company_id = $2',
          [id, companyId],
        );
  const row = result.rows[0];
  if (!row) {
    throw new ProjectNotFoundError(id);
  }
  return toProject(row);
}

export interface CreateProjectInput {
  name: string;
  isActive?: boolean;
}

export async function createProject(input: CreateProjectInput, companyId: string | null): Promise<Project> {
  // Punto 2 della code review "niente logica nei controller": tsoa valida che
  // "name" sia una stringa (campo non opzionale sul body), ma non che non sia
  // vuota dopo trim, prima un controllo identico in projectController.createProject.
  assertNonEmpty(input.name, 'name');
  if (companyId === null) {
    throw new MissingCompanyError();
  }

  // id generato dal database: projects.id ha DEFAULT gen_random_uuid() dalla
  // migration 0005_projects_id_default_gen_random_uuid.sql.
  const isActive = input.isActive ?? true;
  const result = await pool.query<ProjectRow>(
    'INSERT INTO projects (name, is_active, company_id) VALUES ($1, $2, $3) RETURNING id, name, is_active, customer_id',
    [input.name, isActive, companyId],
  );
  const project = toProject(result.rows[0]);
  // companyId è già stato ristretto a "string" dal guard sopra (MissingCompanyError
  // se null): l'evento realtime deve raggiungere solo la company del progetto
  // appena creato, non ogni client connesso (vedi realtime/io.ts).
  emitProjectCreated(project, companyId);
  return project;
}

export interface UpdateProjectInput {
  name?: string;
  isActive?: boolean;
  // Tri-stato come UpdateTaskInput.dueDate in taskService.ts: assente (non
  // toccare), null (scollega il cliente), stringa (assegnalo) — per questo
  // non può seguire il pattern COALESCE di name/isActive sotto.
  customerId?: string | null;
}

export async function updateProject(
  id: string,
  input: UpdateProjectInput,
  companyId: string | null,
): Promise<Project> {
  // Stesso guard di getProjectById: un id sintatticamente non valido non può
  // combaciare con nessuna riga, intercettarlo qui evita l'errore del driver.
  if (!isValidUuid(id)) {
    throw new ProjectNotFoundError(id);
  }
  // Stesso principio di createProject sopra: solo se il chiamante ha
  // effettivamente toccato il campo (un PUT parziale può ometterlo).
  if (input.name !== undefined) {
    assertNonEmpty(input.name, 'name');
  }

  // Verifica che il cliente scelto appartenga davvero alla company del
  // richiedente: senza questo, un id di un cliente di un'altra azienda
  // (indovinato o riusato da un'altra sessione) verrebbe accettato silenziosamente
  // dalla sola FK, che non conosce il concetto di company_id del progetto
  // (stesso principio della verifica "ownedIds" in setProjectAssignments,
  // projectAssignmentService.ts).
  if (input.customerId !== undefined && input.customerId !== null) {
    if (!isValidUuid(input.customerId)) {
      throw new CustomerNotFoundError(input.customerId);
    }
    const customerCheck = await pool.query(
      'SELECT 1 FROM customers WHERE id = $1 AND company_id = $2',
      [input.customerId, companyId],
    );
    if (customerCheck.rowCount === 0) {
      throw new CustomerNotFoundError(input.customerId);
    }
  }

  // COALESCE applica solo i campi effettivamente forniti (undefined -> null
  // -> valore colonna invariato) per name/isActive, senza costruire la SET
  // clause a mano concatenando stringhe in base ai campi presenti. customerId
  // va invece nella SET clause solo se il chiamante l'ha toccato (stesso
  // pattern di dueDate in taskService.updateTask), per poter davvero scrivere
  // null e scollegare il cliente.
  const setClauses = ['name = COALESCE($3, name)', 'is_active = COALESCE($4, is_active)'];
  const values: unknown[] = [id, companyId, input.name ?? null, input.isActive ?? null];
  if (input.customerId !== undefined) {
    values.push(input.customerId);
    setClauses.push(`customer_id = $${values.length}`);
  }

  const result = await pool.query<ProjectRow>(
    `UPDATE projects
     SET ${setClauses.join(', ')}
     WHERE id = $1 AND company_id = $2
     RETURNING id, name, is_active, customer_id`,
    values,
  );
  const row = result.rows[0];
  if (!row) {
    throw new ProjectNotFoundError(id);
  }
  const project = toProject(row);
  // Una riga trovata implica companyId non null: WHERE company_id = $2 non può
  // combaciare con NULL (company_id è NOT NULL), quindi se la query ha
  // restituito qualcosa companyId era per forza un valore reale. Il cast
  // esplicito evita di allargare la firma di emitProjectUpdated a
  // "string | null" solo per questo unico chiamante (vedi stesso ragionamento
  // in projectAssignmentService.ts riga ~81).
  emitProjectUpdated(project, companyId as string);
  return project;
}

export async function deleteProject(id: string, companyId: string | null): Promise<void> {
  // Stesso guard di getProjectById: un id sintatticamente non valido non può
  // combaciare con nessuna riga, intercettarlo qui evita l'errore del driver.
  if (!isValidUuid(id)) {
    throw new ProjectNotFoundError(id);
  }

  const result = await pool.query('DELETE FROM projects WHERE id = $1 AND company_id = $2', [id, companyId]);
  if (result.rowCount === 0) {
    throw new ProjectNotFoundError(id);
  }
  // Stesso ragionamento di updateProject: rowCount > 0 implica companyId non
  // null (company_id è NOT NULL, non può combaciare con un parametro NULL).
  emitProjectDeleted(id, companyId as string);
}
