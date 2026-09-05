import { describe, it, expect, vi, beforeEach } from 'vitest';

// pool mockato: nessuna di queste query deve mai toccare un Postgres reale.
// Stesso pattern di projectAssignmentService.test.ts.
vi.mock('../db/pool', () => ({
  pool: {
    query: vi.fn(),
    connect: vi.fn(),
  },
}));

import { DatabaseError } from 'pg';
import { pool } from '../db/pool';
import type { CompanyExportData } from './exportService';
import { UserConflictError } from './userService';
import { deleteCompany, importCompanyData } from './companyService';

const poolConnect = vi.mocked(pool.connect);

const COMPANY_ID = 'old-company';
const OWNER_ID = 'old-owner';

beforeEach(() => {
  poolConnect.mockReset();
});

describe('deleteCompany: ordine dettato dalle FK incrociate companies.owner_id <-> users.company_id (nessuna cascade)', () => {
  it('esegue le query nell\'ordine corretto: progetti, dipendenti, azzeramento owner, company, owner', async () => {
    const client = { query: vi.fn().mockResolvedValue({}), release: vi.fn() };
    poolConnect.mockResolvedValue(client as never);

    await deleteCompany(COMPANY_ID, OWNER_ID);

    const calls = client.query.mock.calls.map(([sql]) => sql as string);
    expect(calls).toEqual([
      'BEGIN',
      'DELETE FROM projects WHERE company_id = $1',
      'DELETE FROM users WHERE company_id = $1 AND id <> $2',
      'UPDATE users SET company_id = NULL, role = NULL WHERE id = $1',
      'DELETE FROM companies WHERE id = $1',
      'DELETE FROM users WHERE id = $1',
      'COMMIT',
    ]);
    // L'owner non deve mai comparire nel DELETE dei dipendenti (id <> $2 con
    // $2 = ownerId): verificato sui parametri, non solo sul testo della query.
    expect(client.query.mock.calls[2][1]).toEqual([COMPANY_ID, OWNER_ID]);
    expect(client.release).toHaveBeenCalled();
  });

  it('fa ROLLBACK e rilascia comunque il client se una query fallisce a metà', async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // DELETE projects
        .mockRejectedValueOnce(new Error('boom')) // DELETE users fallisce
        .mockResolvedValueOnce({}), // ROLLBACK
      release: vi.fn(),
    };
    poolConnect.mockResolvedValue(client as never);

    await expect(deleteCompany(COMPANY_ID, OWNER_ID)).rejects.toThrow('boom');

    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });
});

function makeExportPayload(): CompanyExportData {
  return {
    company: {
      id: COMPANY_ID,
      name: 'Acme',
      ownerId: OWNER_ID,
      ragioneSociale: null,
      piva: null,
      codiceFiscale: null,
      indirizzo: null,
      pec: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    users: [
      {
        id: OWNER_ID,
        username: 'owner',
        email: 'owner@example.com',
        companyId: COMPANY_ID,
        role: 'owner',
        mustChangePassword: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        lastLoginAt: null,
      },
      {
        id: 'old-employee',
        username: 'dipendente',
        email: 'dip@example.com',
        companyId: COMPANY_ID,
        role: 'employee',
        mustChangePassword: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        lastLoginAt: null,
      },
    ],
    projects: [{ id: 'old-project', name: 'Progetto 1', isActive: true }],
    projectAssignments: [{ projectId: 'old-project', userId: 'old-employee' }],
    tasks: [
      {
        id: 'old-task',
        projectId: 'old-project',
        title: 'Task 1',
        description: null,
        status: 'progress',
        priority: 5,
        dueDate: null,
        assignees: [{ id: 'old-employee', username: 'dipendente' }],
        workStartedAt: null,
        workAccumulatedSeconds: 0,
        workEndedAt: null,
        projectName: 'Progetto 1',
      },
    ],
    comments: [
      {
        id: 'old-comment',
        taskId: 'old-task',
        projectId: 'old-project',
        authorId: 'old-employee',
        authorUsername: 'dipendente',
        body: 'ciao a tutti',
        createdAt: '2026-01-02T00:00:00.000Z',
        edited: false,
      },
    ],
    backups: [],
  };
}

// Router basato sul testo della query (stesso principio di
// taskCommentService.test.ts): importCompanyData attraversa molte INSERT in
// sequenza e legare il test all'ordine esatto lo renderebbe fragile a
// refactor interni che non cambiano il comportamento osservabile.
function mockClientForSuccessfulImport() {
  const client = { query: vi.fn(), release: vi.fn() };
  client.query.mockImplementation(async (sql: string, params: unknown[] = []) => {
    if (sql === 'BEGIN' || sql === 'COMMIT') return {};
    if (sql.includes('INSERT INTO users (id, username, email, password, recovery_code_hash)')) {
      return {};
    }
    if (sql.includes('INSERT INTO companies')) {
      return {
        rows: [
          {
            id: 'new-company',
            name: params[0],
            owner_id: params[1],
            ragione_sociale: params[2],
            piva: params[3],
            codice_fiscale: params[4],
            indirizzo: params[5],
            pec: params[6],
            created_at: new Date(),
            tariffa_oraria: null,
            tariffa_unita: null,
            lavora_lunedi: false,
            lavora_martedi: false,
            lavora_mercoledi: false,
            lavora_giovedi: false,
            lavora_venerdi: false,
            lavora_sabato: false,
            lavora_domenica: false,
            orario_continuativo: true,
            ora_inizio_1: null,
            ora_fine_1: null,
            ora_inizio_2: null,
            ora_fine_2: null,
          },
        ],
      };
    }
    if (sql.includes("role = 'owner'")) {
      return {
        rows: [
          {
            id: params[0],
            username: 'owner',
            email: 'owner@example.com',
            password: 'hash',
            company_id: params[1],
            role: 'owner',
            must_change_password: false,
            created_at: new Date(),
            last_login_at: null,
          },
        ],
      };
    }
    if (sql.includes('INSERT INTO users (id, username, email, password, company_id, role, must_change_password)')) {
      return {};
    }
    if (sql.includes('INSERT INTO projects')) {
      return { rows: [{ id: 'new-project' }] };
    }
    if (sql.includes('INSERT INTO project_assignments')) {
      return {};
    }
    if (sql.includes('INSERT INTO tasks')) {
      return { rows: [{ id: 'new-task' }] };
    }
    if (sql.includes('INSERT INTO task_assignments')) {
      return {};
    }
    if (sql.includes('INSERT INTO task_comments')) {
      return {};
    }
    throw new Error(`Query non attesa nel test: ${sql}`);
  });
  return client;
}

describe('importCompanyData: remapping id vecchio->nuovo', () => {
  it('ricrea progetti/task/commenti/assegnazioni con i riferimenti ai NUOVI id, non ai vecchi', async () => {
    const client = mockClientForSuccessfulImport();
    poolConnect.mockResolvedValue(client as never);

    const result = await importCompanyData({ data: makeExportPayload(), ownerPassword: 'Password1' });

    expect(result.user.role).toBe('owner');
    expect(result.company.id).toBe('new-company');
    expect(result.temporaryPasswords).toEqual([
      { username: 'dipendente', role: 'employee', password: expect.any(String) },
    ]);
    // Mai la password originale (mai esistita in chiaro lato server): una
    // nuova generata qui, diversa a ogni chiamata.
    expect(result.temporaryPasswords[0].password.length).toBeGreaterThanOrEqual(8);

    const calls = client.query.mock.calls;
    const employeeInsert = calls.find(([sql]) =>
      (sql as string).includes('INSERT INTO users (id, username, email, password, company_id, role, must_change_password)'),
    );
    const newEmployeeId = (employeeInsert?.[1] as unknown[])[0] as string;
    expect(newEmployeeId).not.toBe('old-employee');

    const projectAssignmentInsert = calls.find(([sql]) => (sql as string).includes('INSERT INTO project_assignments'));
    expect(projectAssignmentInsert?.[1]).toEqual(['new-project', newEmployeeId]);

    const taskInsert = calls.find(([sql]) => (sql as string).includes('INSERT INTO tasks'));
    expect((taskInsert?.[1] as unknown[])[0]).toBe('new-project');

    const taskAssignmentInsert = calls.find(([sql]) => (sql as string).includes('INSERT INTO task_assignments'));
    expect(taskAssignmentInsert?.[1]).toEqual(['new-task', [newEmployeeId]]);

    const commentInsert = calls.find(([sql]) => (sql as string).includes('INSERT INTO task_comments'));
    expect(commentInsert?.[1]).toEqual(['new-task', newEmployeeId, 'ciao a tutti', '2026-01-02T00:00:00.000Z', false]);

    expect(client.release).toHaveBeenCalled();
  });

  it('fallisce in blocco (rollback, nessun import parziale) su username/email già in uso: 409 tramite UserConflictError', async () => {
    const client = { query: vi.fn(), release: vi.fn() };
    client.query.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN') return {};
      if (sql === 'ROLLBACK') return {};
      if (sql.includes('INSERT INTO users (id, username, email, password, recovery_code_hash)')) {
        const err = new DatabaseError('duplicate key value violates unique constraint', 0, 'error');
        err.code = '23505';
        err.constraint = 'users_unique_1';
        throw err;
      }
      throw new Error(`Query non attesa nel test: ${sql}`);
    });
    poolConnect.mockResolvedValue(client as never);

    await expect(importCompanyData({ data: makeExportPayload(), ownerPassword: 'Password1' })).rejects.toBeInstanceOf(
      UserConflictError,
    );

    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });
});
