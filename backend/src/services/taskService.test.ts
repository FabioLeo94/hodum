import { describe, it, expect, vi, beforeEach } from 'vitest';

// pool mockato: nessuna di queste query deve mai toccare un Postgres reale.
// Stesso pattern di projectAssignmentService.test.ts/companyService.test.ts.
vi.mock('../db/pool', () => ({
  pool: {
    query: vi.fn(),
    connect: vi.fn(),
  },
}));

import { pool } from '../db/pool';
import {
  deleteTask,
  setTaskAssignees,
  TaskLockedError,
  TaskNotFoundError,
  updateTask,
  updateTaskPriority,
  updateTaskStatus,
  updateTaskWorkTimer,
} from './taskService';

function taskSelectRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TASK_ID,
    project_id: PROJECT_ID,
    title: 'Task',
    description: null,
    priority: 5,
    due_date: null,
    work_started_at: null,
    work_accumulated_seconds: 0,
    work_ended_at: null,
    invoice_id: null,
    status_name: 'in progress',
    ...overrides,
  };
}

const poolQuery = vi.mocked(pool.query);
const poolConnect = vi.mocked(pool.connect);

const PROJECT_ID = '11111111-1111-1111-1111-111111111111';
const TASK_ID = '22222222-2222-2222-2222-222222222222';
const COMPANY_ID = 'company-1';

// Riga come esce da projectService.getProjectById, prima query di ogni
// funzione mutante sotto test (vedi getProjectById(projectId, companyId) in
// ognuna): stessa forma di ProjectRow in projectService.ts.
function projectRow() {
  return { id: PROJECT_ID, name: 'Progetto', is_active: true, customer_id: null };
}

beforeEach(() => {
  poolQuery.mockReset();
  poolConnect.mockReset();
});

// Le 6 operazioni mutanti che devono rifiutare un task già lockato (vedi
// commento su TaskLockedError/assertTaskNotLocked in taskService.ts): stessa
// sequenza di query per ciascuna (getProjectById, poi la verifica di lock),
// nessuna delle quali arriva mai a un UPDATE/DELETE se il task risulta già
// fatturato.
describe('Lock dei task fatturati: le 6 funzioni mutanti rifiutano un task con invoice_id valorizzato', () => {
  it('updateTask lancia TaskLockedError e non esegue alcun UPDATE', async () => {
    poolQuery
      .mockResolvedValueOnce({ rows: [projectRow()] } as never) // getProjectById
      .mockResolvedValueOnce({ rows: [{ invoice_id: 'invoice-1' }] } as never); // assertTaskNotLocked

    await expect(updateTask(PROJECT_ID, TASK_ID, { title: 'Nuovo titolo' }, COMPANY_ID)).rejects.toBeInstanceOf(
      TaskLockedError,
    );
    expect(poolQuery).toHaveBeenCalledTimes(2);
  });

  it('updateTaskStatus lancia TaskLockedError prima di leggere lo stato corrente', async () => {
    poolQuery
      .mockResolvedValueOnce({ rows: [projectRow()] } as never)
      .mockResolvedValueOnce({ rows: [{ invoice_id: 'invoice-1' }] } as never);

    await expect(updateTaskStatus(PROJECT_ID, TASK_ID, 'completed', COMPANY_ID)).rejects.toBeInstanceOf(
      TaskLockedError,
    );
    expect(poolQuery).toHaveBeenCalledTimes(2);
  });

  it('updateTaskPriority lancia TaskLockedError e non esegue l\'UPDATE della priorità', async () => {
    poolQuery
      .mockResolvedValueOnce({ rows: [projectRow()] } as never)
      .mockResolvedValueOnce({ rows: [{ invoice_id: 'invoice-1' }] } as never);

    await expect(updateTaskPriority(PROJECT_ID, TASK_ID, 3, COMPANY_ID)).rejects.toBeInstanceOf(TaskLockedError);
    expect(poolQuery).toHaveBeenCalledTimes(2);
  });

  it("updateTaskWorkTimer lancia TaskLockedError: il timer di un task fatturato non può più ripartire", async () => {
    poolQuery
      .mockResolvedValueOnce({ rows: [projectRow()] } as never)
      .mockResolvedValueOnce({ rows: [{ invoice_id: 'invoice-1' }] } as never);

    await expect(updateTaskWorkTimer(PROJECT_ID, TASK_ID, 'start', COMPANY_ID)).rejects.toBeInstanceOf(
      TaskLockedError,
    );
    expect(poolQuery).toHaveBeenCalledTimes(2);
  });

  it('deleteTask lancia TaskLockedError: un task fatturato non si cancella più', async () => {
    poolQuery
      .mockResolvedValueOnce({ rows: [projectRow()] } as never)
      .mockResolvedValueOnce({ rows: [{ invoice_id: 'invoice-1' }] } as never);

    await expect(deleteTask(PROJECT_ID, TASK_ID, COMPANY_ID)).rejects.toBeInstanceOf(TaskLockedError);
    expect(poolQuery).toHaveBeenCalledTimes(2);
  });

  it('setTaskAssignees lancia TaskLockedError prima di aprire la transazione (nessun client.connect)', async () => {
    poolQuery
      .mockResolvedValueOnce({ rows: [projectRow()] } as never)
      .mockResolvedValueOnce({ rows: [{ invoice_id: 'invoice-1' }] } as never);

    await expect(setTaskAssignees(PROJECT_ID, TASK_ID, [], COMPANY_ID, 'actor-1')).rejects.toBeInstanceOf(
      TaskLockedError,
    );
    expect(poolQuery).toHaveBeenCalledTimes(2);
    expect(poolConnect).not.toHaveBeenCalled();
  });
});

describe('assertTaskNotLocked: distingue "non trovato" da "lockato"', () => {
  it('un taskId/projectId che non combaciano con nessuna riga restano TaskNotFoundError, non TaskLockedError', async () => {
    poolQuery
      .mockResolvedValueOnce({ rows: [projectRow()] } as never)
      .mockResolvedValueOnce({ rows: [] } as never); // nessuna riga: task inesistente o di un altro progetto

    await expect(updateTaskPriority(PROJECT_ID, TASK_ID, 3, COMPANY_ID)).rejects.toBeInstanceOf(TaskNotFoundError);
  });

  it('un task con invoice_id NULL non è lockato: updateTaskPriority procede normalmente', async () => {
    poolQuery
      .mockResolvedValueOnce({ rows: [projectRow()] } as never) // getProjectById
      .mockResolvedValueOnce({ rows: [{ invoice_id: null }] } as never) // assertTaskNotLocked
      .mockResolvedValueOnce({ rowCount: 1 } as never) // UPDATE priority
      .mockResolvedValueOnce({
        rows: [
          {
            id: TASK_ID,
            project_id: PROJECT_ID,
            title: 'Task',
            description: null,
            priority: 3,
            due_date: null,
            work_started_at: null,
            work_accumulated_seconds: 0,
            work_ended_at: null,
            invoice_id: null,
            status_name: 'in progress',
          },
        ],
      } as never) // getTaskById: TASK_SELECT
      .mockResolvedValueOnce({ rows: [] } as never); // loadAssigneesByTaskIds

    const task = await updateTaskPriority(PROJECT_ID, TASK_ID, 3, COMPANY_ID);
    expect(task.priority).toBe(3);
    expect(task.invoiceId).toBeNull();
  });
});

// Race condition: assertTaskNotLocked (fast-path) passa perché a quel momento
// invoice_id è ancora NULL, ma una generateInvoice concorrente lockasse il
// task PRIMA della UPDATE/DELETE reale. Senza "AND invoice_id IS NULL" nella
// WHERE di quella UPDATE/DELETE, la mutazione andrebbe comunque a segno.
// Questi test ispezionano la query passata al mock di pool.query, non solo
// l'esito: verificano che il filtro sia davvero nella query eseguita, non
// solo che assertTaskNotLocked prema il fast-path (già coperto sopra).
describe('Race fatturazione: la UPDATE/DELETE reale filtra invoice_id IS NULL, non solo il fast-path', () => {
  it('updateTaskPriority include "invoice_id IS NULL" nella UPDATE reale', async () => {
    poolQuery
      .mockResolvedValueOnce({ rows: [projectRow()] } as never) // getProjectById
      .mockResolvedValueOnce({ rows: [{ invoice_id: null }] } as never) // assertTaskNotLocked
      .mockResolvedValueOnce({ rowCount: 1 } as never) // UPDATE priority
      .mockResolvedValueOnce({ rows: [taskSelectRow({ priority: 3 })] } as never) // getTaskById
      .mockResolvedValueOnce({ rows: [] } as never); // loadAssigneesByTaskIds

    await updateTaskPriority(PROJECT_ID, TASK_ID, 3, COMPANY_ID);

    const updateCall = poolQuery.mock.calls[2];
    expect(updateCall[0]).toEqual(expect.stringContaining('invoice_id IS NULL'));
  });

  it('updateTaskPriority: se la UPDATE trova 0 righe perché il task è stato lockato nel frattempo, lancia TaskLockedError (non TaskNotFoundError)', async () => {
    poolQuery
      .mockResolvedValueOnce({ rows: [projectRow()] } as never) // getProjectById
      .mockResolvedValueOnce({ rows: [{ invoice_id: null }] } as never) // assertTaskNotLocked: non lockato ORA
      .mockResolvedValueOnce({ rowCount: 0 } as never) // UPDATE: 0 righe, il filtro invoice_id IS NULL non ha combaciato
      .mockResolvedValueOnce({ rows: [{ invoice_id: 'invoice-1' }] } as never); // resolveTaskMutationFailure: ORA è lockato

    await expect(updateTaskPriority(PROJECT_ID, TASK_ID, 3, COMPANY_ID)).rejects.toBeInstanceOf(TaskLockedError);
  });

  it('deleteTask include "invoice_id IS NULL" nella DELETE reale e distingue la race da un vero "non trovato"', async () => {
    poolQuery
      .mockResolvedValueOnce({ rows: [projectRow()] } as never)
      .mockResolvedValueOnce({ rows: [{ invoice_id: null }] } as never)
      .mockResolvedValueOnce({ rowCount: 1 } as never); // DELETE

    await deleteTask(PROJECT_ID, TASK_ID, COMPANY_ID);
    expect(poolQuery.mock.calls[2][0]).toEqual(expect.stringContaining('invoice_id IS NULL'));

    poolQuery.mockReset();
    poolQuery
      .mockResolvedValueOnce({ rows: [projectRow()] } as never)
      .mockResolvedValueOnce({ rows: [{ invoice_id: null }] } as never)
      .mockResolvedValueOnce({ rowCount: 0 } as never) // DELETE: 0 righe, race
      .mockResolvedValueOnce({ rows: [] } as never); // resolveTaskMutationFailure: il task non c'è più

    await expect(deleteTask(PROJECT_ID, TASK_ID, COMPANY_ID)).rejects.toBeInstanceOf(TaskNotFoundError);
  });

  it('updateTaskWorkTimer("start") include "invoice_id IS NULL" e resta un no-op silenzioso se 0 righe per un motivo diverso dal lock (timer già avviato)', async () => {
    poolQuery
      .mockResolvedValueOnce({ rows: [projectRow()] } as never)
      .mockResolvedValueOnce({ rows: [{ invoice_id: null }] } as never) // assertTaskNotLocked
      .mockResolvedValueOnce({ rowCount: 0 } as never) // UPDATE start: 0 righe (timer già avviato, non lock)
      .mockResolvedValueOnce({ rows: [{ invoice_id: null }] } as never) // throwIfLockedByRace: non lockato
      .mockResolvedValueOnce({ rows: [taskSelectRow({ work_started_at: new Date() })] } as never) // getTaskById
      .mockResolvedValueOnce({ rows: [] } as never); // loadAssigneesByTaskIds

    const task = await updateTaskWorkTimer(PROJECT_ID, TASK_ID, 'start', COMPANY_ID);

    expect(poolQuery.mock.calls[2][0]).toEqual(expect.stringContaining('invoice_id IS NULL'));
    expect(task.id).toBe(TASK_ID);
  });

  it('updateTaskWorkTimer("start") lancia TaskLockedError se le 0 righe sono dovute a una fatturazione concorrente, non a un timer già avviato', async () => {
    poolQuery
      .mockResolvedValueOnce({ rows: [projectRow()] } as never)
      .mockResolvedValueOnce({ rows: [{ invoice_id: null }] } as never) // assertTaskNotLocked
      .mockResolvedValueOnce({ rowCount: 0 } as never) // UPDATE start: 0 righe
      .mockResolvedValueOnce({ rows: [{ invoice_id: 'invoice-1' }] } as never); // throwIfLockedByRace: lockato nel frattempo

    await expect(updateTaskWorkTimer(PROJECT_ID, TASK_ID, 'start', COMPANY_ID)).rejects.toBeInstanceOf(
      TaskLockedError,
    );
  });

  it('setTaskAssignees: la SELECT dentro la transazione filtra invoice_id IS NULL con FOR UPDATE, e distingue la race dal "non trovato"', async () => {
    poolQuery
      .mockResolvedValueOnce({ rows: [projectRow()] } as never) // getProjectById
      .mockResolvedValueOnce({ rows: [{ invoice_id: null }] } as never); // assertTaskNotLocked (fast-path)

    const client = { query: vi.fn(), release: vi.fn() };
    poolConnect.mockResolvedValueOnce(client as never);
    client.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // SELECT ... FOR UPDATE: 0 righe, race
      .mockResolvedValueOnce({ rows: [{ invoice_id: 'invoice-1' }] }) // verifica: lockato nel frattempo
      .mockResolvedValueOnce({}); // ROLLBACK

    await expect(setTaskAssignees(PROJECT_ID, TASK_ID, [], COMPANY_ID, 'actor-1')).rejects.toBeInstanceOf(
      TaskLockedError,
    );
    expect(client.query.mock.calls[1][0]).toEqual(expect.stringContaining('invoice_id IS NULL'));
    expect(client.query.mock.calls[1][0]).toEqual(expect.stringContaining('FOR UPDATE'));
    expect(client.query).toHaveBeenNthCalledWith(4, 'ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });
});
