import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/pool', () => ({
  pool: { query: vi.fn() },
}));

import { pool } from '../db/pool';
import { ProjectNotFoundError } from '../services/projectService';
import { AuthorizationError } from '../middleware/authentication';
import {
  CommentNotFoundError,
  TaskNotFoundError,
  createComment,
  deleteComment,
  updateComment,
} from './taskCommentService';

const poolQuery = vi.mocked(pool.query);

const PROJECT_ID = '11111111-1111-1111-1111-111111111111';
const TASK_ID = '22222222-2222-2222-2222-222222222222';
const COMMENT_ID = '33333333-3333-3333-3333-333333333333';
const AUTHOR_ID = 'author-1';
const OTHER_USER_ID = 'someone-else';

function commentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: COMMENT_ID,
    task_id: TASK_ID,
    project_id: PROJECT_ID,
    author_id: AUTHOR_ID,
    author_username: 'mario',
    body: 'ciao',
    created_at: '2026-01-01T00:00:00.000Z',
    edited: false,
    ...overrides,
  };
}

// Router basato sul testo della query invece di un ordine fisso di
// mockImplementationOnce: updateComment/deleteComment attraversano più query
// in sequenza (progetto -> task -> autore -> scrittura -> riselezione) e
// legare il test all'ordine esatto lo renderebbe fragile a refactor interni
// che non cambiano il comportamento osservabile.
function mockQueriesForExistingComment(authorId: string) {
  poolQuery.mockImplementation(async (sql: string) => {
    if (sql.includes('FROM projects WHERE id')) {
      return { rowCount: 1, rows: [{ id: PROJECT_ID, name: 'Progetto', is_active: true }] } as never;
    }
    if (sql.includes('FROM tasks WHERE id = $1 AND project_id = $2')) {
      return { rowCount: 1, rows: [{}] } as never;
    }
    if (sql.includes('SELECT author_id FROM task_comments')) {
      return { rowCount: 1, rows: [{ author_id: authorId }] } as never;
    }
    if (sql.startsWith('UPDATE task_comments') || sql.startsWith('DELETE FROM task_comments')) {
      return { rowCount: 1, rows: [] } as never;
    }
    if (sql.includes('FROM task_comments tc') && sql.includes('WHERE tc.id = $1')) {
      return { rowCount: 1, rows: [commentRow({ author_id: authorId })] } as never;
    }
    throw new Error(`Query non attesa nel test: ${sql}`);
  });
}

beforeEach(() => {
  poolQuery.mockReset();
});

describe('updateComment / deleteComment: solo l\'autore può modificare o eliminare', () => {
  it('permette la modifica quando il richiedente è l\'autore del commento', async () => {
    mockQueriesForExistingComment(AUTHOR_ID);

    await expect(updateComment(PROJECT_ID, TASK_ID, COMMENT_ID, AUTHOR_ID, 'nuovo testo', 'company-1')).resolves.toMatchObject(
      { id: COMMENT_ID },
    );
  });

  it("rifiuta con AuthorizationError (403, non 404) un utente diverso dall'autore che prova a modificare", async () => {
    mockQueriesForExistingComment(AUTHOR_ID);

    await expect(
      updateComment(PROJECT_ID, TASK_ID, COMMENT_ID, OTHER_USER_ID, 'testo malevolo', 'company-1'),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("rifiuta con AuthorizationError un utente diverso dall'autore che prova a eliminare, incluso un manager/owner (nessuna eccezione di ruolo su questa risorsa)", async () => {
    mockQueriesForExistingComment(AUTHOR_ID);

    await expect(deleteComment(PROJECT_ID, TASK_ID, COMMENT_ID, OTHER_USER_ID, 'company-1')).rejects.toBeInstanceOf(
      AuthorizationError,
    );
  });

  it('permette la cancellazione al vero autore', async () => {
    mockQueriesForExistingComment(AUTHOR_ID);

    await expect(deleteComment(PROJECT_ID, TASK_ID, COMMENT_ID, AUTHOR_ID, 'company-1')).resolves.toBeUndefined();
  });

  it('CommentNotFoundError se il commento non esiste sotto quel task (id valido ma di un altro task)', async () => {
    poolQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM projects WHERE id')) {
        return { rowCount: 1, rows: [{ id: PROJECT_ID, name: 'Progetto', is_active: true }] } as never;
      }
      if (sql.includes('FROM tasks WHERE id = $1 AND project_id = $2')) {
        return { rowCount: 1, rows: [{}] } as never;
      }
      if (sql.includes('SELECT author_id FROM task_comments')) {
        return { rowCount: 0, rows: [] } as never;
      }
      throw new Error(`Query non attesa nel test: ${sql}`);
    });

    await expect(updateComment(PROJECT_ID, TASK_ID, COMMENT_ID, AUTHOR_ID, 'testo', 'company-1')).rejects.toBeInstanceOf(
      CommentNotFoundError,
    );
  });

  it('TaskNotFoundError se il progetto esiste ma il task no (cross-project)', async () => {
    poolQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM projects WHERE id')) {
        return { rowCount: 1, rows: [{ id: PROJECT_ID, name: 'Progetto', is_active: true }] } as never;
      }
      if (sql.includes('FROM tasks WHERE id = $1 AND project_id = $2')) {
        return { rowCount: 0, rows: [] } as never;
      }
      throw new Error(`Query non attesa nel test: ${sql}`);
    });

    await expect(updateComment(PROJECT_ID, TASK_ID, COMMENT_ID, AUTHOR_ID, 'testo', 'company-1')).rejects.toBeInstanceOf(
      TaskNotFoundError,
    );
  });

  it('ProjectNotFoundError (non un errore del driver) se il progetto è di un\'altra company', async () => {
    poolQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM projects WHERE id')) {
        return { rowCount: 0, rows: [] } as never;
      }
      throw new Error(`Query non attesa nel test: ${sql}`);
    });

    await expect(
      createComment(PROJECT_ID, TASK_ID, AUTHOR_ID, 'testo', 'company-di-un-altro'),
    ).rejects.toBeInstanceOf(ProjectNotFoundError);
  });
});
