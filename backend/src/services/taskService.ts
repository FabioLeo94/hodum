import { pool } from '../db/pool';
import type { Task, TaskStatus } from '../models/task';
import { getProjectById } from './projectService';

export { ProjectNotFoundError } from './projectService';

// Forma della riga così come esce dalla JOIN con task_status: snake_case,
// coerente con lo schema in migrations/0002_baseline_schema_esistente.sql.
interface TaskRow {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status_name: string;
}

// task_status.name (seed in migrations/0004_task_status_smallint_identity_e_seed_stati_assegnabili.sql)
// usa "in progress" mentre il dominio applicativo e il frontend usano lo slug
// "progress": mappatura esplicita invece di derivarla a runtime, così un
// rename di task_status.name non cambia silenziosamente i valori esposti
// dall'API.
const STATUS_NAME_TO_SLUG: Record<string, TaskStatus> = {
  'in progress': 'progress',
  review: 'review',
  completed: 'completed',
  rejected: 'rejected',
};

function toTask(row: TaskRow): Task {
  const status = STATUS_NAME_TO_SLUG[row.status_name];
  if (!status) {
    throw new Error(`Stato task sconosciuto: ${row.status_name}`);
  }
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    status,
  };
}

export async function listTasksByProject(projectId: string): Promise<Task[]> {
  // Verifica esistenza del progetto: senza, un id inesistente risponderebbe
  // con una lista vuota indistinguibile da "progetto esistente senza task".
  // getProjectById lancia ProjectNotFoundError, che il controller intercetta
  // per rispondere 404 (stesso pattern di projectController.ts).
  await getProjectById(projectId);

  const result = await pool.query<TaskRow>(
    `SELECT t.id, t.project_id, t.title, t.description, ts.name AS status_name
     FROM tasks t
     JOIN task_status ts ON ts.id = t.status
     WHERE t.project_id = $1
     ORDER BY t.creation_date NULLS LAST, t.title`,
    [projectId],
  );
  return result.rows.map(toTask);
}
