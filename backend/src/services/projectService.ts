import { pool } from '../db/pool';
import type { Project } from '../models/project';

// Segnala "0 righe trovate/modificate" al chiamante senza che il service
// conosca HTTP: il controller la intercetta e decide lo status (404).
export class ProjectNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Project con id ${id} non trovato`);
    this.name = 'ProjectNotFoundError';
  }
}

// Forma della riga così come esce da pg: snake_case, coerente con lo schema
// in migrations/0002_baseline_schema_esistente.sql.
interface ProjectRow {
  id: string;
  name: string;
  is_active: boolean;
}

function toProject(row: ProjectRow): Project {
  return { id: row.id, name: row.name, isActive: row.is_active };
}

export async function listProjects(): Promise<Project[]> {
  const result = await pool.query<ProjectRow>('SELECT id, name, is_active FROM projects ORDER BY name');
  return result.rows.map(toProject);
}

export async function getProjectById(id: string): Promise<Project> {
  const result = await pool.query<ProjectRow>('SELECT id, name, is_active FROM projects WHERE id = $1', [id]);
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

export async function createProject(input: CreateProjectInput): Promise<Project> {
  // id generato dal database: projects.id ha DEFAULT gen_random_uuid() dalla
  // migration 0005_projects_id_default_gen_random_uuid.sql.
  const isActive = input.isActive ?? true;
  const result = await pool.query<ProjectRow>(
    'INSERT INTO projects (name, is_active) VALUES ($1, $2) RETURNING id, name, is_active',
    [input.name, isActive],
  );
  return toProject(result.rows[0]);
}

export interface UpdateProjectInput {
  name?: string;
  isActive?: boolean;
}

export async function updateProject(id: string, input: UpdateProjectInput): Promise<Project> {
  // COALESCE applica solo i campi effettivamente forniti (undefined -> null
  // -> valore colonna invariato), senza costruire la SET clause a mano
  // concatenando stringhe in base ai campi presenti.
  const result = await pool.query<ProjectRow>(
    `UPDATE projects
     SET name = COALESCE($2, name), is_active = COALESCE($3, is_active)
     WHERE id = $1
     RETURNING id, name, is_active`,
    [id, input.name ?? null, input.isActive ?? null],
  );
  const row = result.rows[0];
  if (!row) {
    throw new ProjectNotFoundError(id);
  }
  return toProject(row);
}

export async function deleteProject(id: string): Promise<void> {
  const result = await pool.query('DELETE FROM projects WHERE id = $1', [id]);
  if (result.rowCount === 0) {
    throw new ProjectNotFoundError(id);
  }
}
