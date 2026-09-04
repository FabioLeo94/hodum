import { describe, it, expect, vi, beforeEach } from 'vitest';

// pool mockato: nessuna di queste query deve mai toccare un Postgres reale.
// query/connect sono riconfigurati per scenario dentro ogni test/describe.
vi.mock('../db/pool', () => ({
  pool: {
    query: vi.fn(),
    connect: vi.fn(),
  },
}));

import { pool } from '../db/pool';
import type { User } from '../models/user';
import { ProjectNotFoundError } from '../services/projectService';
import { UserNotFoundError } from '../services/userService';
import {
  assertProjectAccessible,
  EmployeeNotFoundError,
  listAssignedProjects,
  setProjectAssignments,
} from './projectAssignmentService';

const poolQuery = vi.mocked(pool.query);
const poolConnect = vi.mocked(pool.connect);

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    username: 'mario',
    email: 'mario@example.com',
    companyId: 'company-1',
    role: 'employee',
    mustChangePassword: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastLoginAt: null,
    ...overrides,
  };
}

const VALID_PROJECT_ID = '11111111-1111-1111-1111-111111111111';
const VALID_EMPLOYEE_ID = '22222222-2222-2222-2222-222222222222';

beforeEach(() => {
  poolQuery.mockReset();
  poolConnect.mockReset();
});

describe('assertProjectAccessible', () => {
  it('è un no-op per owner/manager: la company-scope su getProjectById/listProjects basta già', async () => {
    await assertProjectAccessible(VALID_PROJECT_ID, makeUser({ role: 'owner' }));
    await assertProjectAccessible(VALID_PROJECT_ID, makeUser({ role: 'manager' }));

    expect(poolQuery).not.toHaveBeenCalled();
  });

  it('lascia passare un dipendente assegnato al progetto', async () => {
    poolQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] } as never);

    await expect(assertProjectAccessible(VALID_PROJECT_ID, makeUser({ role: 'employee' }))).resolves.toBeUndefined();
    expect(poolQuery).toHaveBeenCalledWith(expect.stringContaining('FROM project_assignments'), [
      VALID_PROJECT_ID,
      'user-1',
    ]);
  });

  it("rifiuta con ProjectNotFoundError (non un 403) un dipendente NON assegnato: è il caso del task, indistinguibile da un progetto inesistente", async () => {
    poolQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] } as never);

    await expect(assertProjectAccessible(VALID_PROJECT_ID, makeUser({ role: 'employee' }))).rejects.toBeInstanceOf(
      ProjectNotFoundError,
    );
  });

  it('rifiuta un projectId sintatticamente non valido senza nemmeno interrogare il DB', async () => {
    await expect(assertProjectAccessible('not-a-uuid', makeUser({ role: 'employee' }))).rejects.toBeInstanceOf(
      ProjectNotFoundError,
    );
    expect(poolQuery).not.toHaveBeenCalled();
  });
});

describe('listAssignedProjects / setProjectAssignments: scoping sul dipendente giusto', () => {
  it('EmployeeNotFoundError se il target non è un dipendente della company del richiedente (cross-tenant)', async () => {
    poolQuery.mockImplementationOnce(async (sql: string) => {
      expect(sql).toContain('FROM users WHERE id = $1');
      return { rowCount: 1, rows: [{ ...userRow(), company_id: 'another-company', role: 'employee' }] };
    });

    await expect(listAssignedProjects(VALID_EMPLOYEE_ID, 'company-1')).rejects.toBeInstanceOf(EmployeeNotFoundError);
  });

  it("EmployeeNotFoundError se l'id target è un manager/owner, non un dipendente: solo i dipendenti sono un target valido per l'assegnazione progetti", async () => {
    poolQuery.mockImplementationOnce(async () => ({
      rowCount: 1,
      rows: [{ ...userRow(), company_id: 'company-1', role: 'manager' }],
    }));

    await expect(listAssignedProjects(VALID_EMPLOYEE_ID, 'company-1')).rejects.toBeInstanceOf(EmployeeNotFoundError);
  });

  it('elenca i soli progetti assegnati quando il dipendente è davvero della company del richiedente', async () => {
    poolQuery
      .mockImplementationOnce(async () => ({
        rowCount: 1,
        rows: [{ ...userRow(), company_id: 'company-1', role: 'employee' }],
      }))
      .mockImplementationOnce(async () => ({
        rowCount: 1,
        rows: [{ id: 'p1', name: 'Progetto 1', is_active: true }],
      }));

    await expect(listAssignedProjects(VALID_EMPLOYEE_ID, 'company-1')).resolves.toEqual([
      { id: 'p1', name: 'Progetto 1', isActive: true },
    ]);
  });

  it('setProjectAssignments rifiuta un id di progetto che non appartiene alla company del richiedente (IDOR)', async () => {
    poolQuery.mockImplementationOnce(async () => ({
      rowCount: 1,
      rows: [{ ...userRow(), company_id: 'company-1', role: 'employee' }],
    }));
    const client = {
      query: vi.fn(),
      release: vi.fn(),
    };
    poolConnect.mockResolvedValue(client as never);
    client.query
      .mockImplementationOnce(async () => ({})) // BEGIN
      .mockImplementationOnce(async () => ({ rows: [] })) // previousResult (nessuna assegnazione precedente)
      .mockImplementationOnce(async () => ({ rows: [] })) // ownedResult: il progetto richiesto NON appartiene a company-1
      .mockImplementationOnce(async () => ({})); // ROLLBACK

    const foreignProjectId = '33333333-3333-3333-3333-333333333333';
    await expect(
      setProjectAssignments(VALID_EMPLOYEE_ID, [foreignProjectId], 'company-1', 'requester-1'),
    ).rejects.toBeInstanceOf(ProjectNotFoundError);

    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });

  it('setProjectAssignments rifiuta un employeeId che non esiste affatto', async () => {
    poolQuery.mockImplementationOnce(async () => {
      throw new UserNotFoundError(VALID_EMPLOYEE_ID);
    });

    await expect(
      setProjectAssignments(VALID_EMPLOYEE_ID, [], 'company-1', 'requester-1'),
    ).rejects.toBeInstanceOf(EmployeeNotFoundError);
  });
});

function userRow() {
  return {
    id: VALID_EMPLOYEE_ID,
    username: 'dipendente',
    email: 'dip@example.com',
    password: 'hash',
    company_id: 'company-1',
    role: 'employee',
    must_change_password: false,
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    last_login_at: null,
  };
}
