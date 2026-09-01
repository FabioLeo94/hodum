import { pool } from '../db/pool';
import type { Project } from '../models/project';
import type { User } from '../models/user';
import { isValidUuid } from '../utils/uuid';
import { ProjectNotFoundError, toProject, type ProjectRow } from './projectService';
import { UserNotFoundError, getUserById } from './userService';

// Task "Gestione del dipendente": un dipendente non assegnato a un progetto
// deve trovarlo indistinguibile da un progetto inesistente (stesso principio
// di ProjectNotFoundError già applicato al cross-tenant in projectService.ts),
// non un 403 che confermerebbe la sua esistenza. No-op per l'owner: la
// company-scope già applicata da getProjectById/listProjects basta per lui,
// l'owner vede e gestisce tutti i progetti della propria azienda.
export async function assertProjectAccessible(projectId: string, user: User): Promise<void> {
  if (user.role !== 'employee') {
    return;
  }
  if (!isValidUuid(projectId)) {
    throw new ProjectNotFoundError(projectId);
  }
  const result = await pool.query(
    'SELECT 1 FROM project_assignments WHERE project_id = $1 AND user_id = $2',
    [projectId, user.id],
  );
  if (result.rowCount === 0) {
    throw new ProjectNotFoundError(projectId);
  }
}

// Distinta da ProjectNotFoundError/UserNotFoundError generiche: qui l'id esiste
// ma non è un dipendente della company del richiedente, quindi non è un
// target legittimo per l'assegnazione progetti (stesso 404 "non trovato" per
// non confermarne l'esistenza fuori ambito, coerente con getUser in userController.ts).
export class EmployeeNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Dipendente con id ${id} non trovato`);
    this.name = 'EmployeeNotFoundError';
  }
}

async function assertOwnEmployee(employeeId: string, companyId: string): Promise<void> {
  let employee;
  try {
    employee = await getUserById(employeeId);
  } catch (err) {
    if (err instanceof UserNotFoundError) {
      throw new EmployeeNotFoundError(employeeId);
    }
    throw err;
  }
  if (employee.role !== 'employee' || employee.companyId !== companyId) {
    throw new EmployeeNotFoundError(employeeId);
  }
}

export async function listAssignedProjects(employeeId: string, companyId: string): Promise<Project[]> {
  await assertOwnEmployee(employeeId, companyId);

  const result = await pool.query<ProjectRow>(
    `SELECT p.id, p.name, p.is_active FROM projects p
     JOIN project_assignments pa ON pa.project_id = p.id
     WHERE pa.user_id = $1
     ORDER BY p.name`,
    [employeeId],
  );
  return result.rows.map(toProject);
}

// Replace-all: il chiamante (owner) invia l'intero set di progetti che il
// dipendente deve avere assegnati, non un delta — più semplice da esprimere
// lato UI (una checklist) che una coppia di endpoint assign/unassign.
export async function setProjectAssignments(
  employeeId: string,
  projectIds: string[],
  companyId: string,
): Promise<void> {
  await assertOwnEmployee(employeeId, companyId);

  const uniqueIds = [...new Set(projectIds)];
  if (uniqueIds.some((id) => !isValidUuid(id))) {
    throw new ProjectNotFoundError(uniqueIds.find((id) => !isValidUuid(id))!);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (uniqueIds.length > 0) {
      // Verifica che ogni id fornito appartenga davvero alla company del
      // richiedente: senza questo, l'owner potrebbe assegnare al proprio
      // dipendente un progetto di un'altra azienda conoscendone solo l'id.
      const ownedResult = await client.query<{ id: string }>(
        'SELECT id FROM projects WHERE id = ANY($1::uuid[]) AND company_id = $2',
        [uniqueIds, companyId],
      );
      const ownedIds = new Set(ownedResult.rows.map((row) => row.id));
      const missingId = uniqueIds.find((id) => !ownedIds.has(id));
      if (missingId) {
        throw new ProjectNotFoundError(missingId);
      }
    }

    await client.query(
      'DELETE FROM project_assignments WHERE user_id = $1 AND NOT (project_id = ANY($2::uuid[]))',
      [employeeId, uniqueIds],
    );
    if (uniqueIds.length > 0) {
      // Un solo round-trip invece di uno per progetto (N+1): stessa semantica
      // di prima (ON CONFLICT DO NOTHING per le coppie già presenti dopo la
      // DELETE sopra), un solo statement invece di uniqueIds.length INSERT
      // separati nella stessa transazione.
      await client.query(
        `INSERT INTO project_assignments (project_id, user_id)
         SELECT pid, $1 FROM unnest($2::uuid[]) AS pid
         ON CONFLICT DO NOTHING`,
        [employeeId, uniqueIds],
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
