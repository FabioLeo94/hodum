import type { Request as ExRequest } from 'express';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { User } from '../models/user';

vi.mock('../services/projectService', () => ({
  listProjects: vi.fn(),
  getProjectById: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
  MissingCompanyError: class MissingCompanyError extends Error {},
  ProjectNotFoundError: class ProjectNotFoundError extends Error {},
}));
vi.mock('../services/projectAssignmentService', () => ({
  assertProjectAccessible: vi.fn(),
}));

import { listProjects, getProjectById, ProjectNotFoundError } from '../services/projectService';
import { assertProjectAccessible } from '../services/projectAssignmentService';
import { ProjectController } from './projectController';

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

function makeRequest(user: User): ExRequest {
  return { user } as unknown as ExRequest;
}

beforeEach(() => {
  vi.mocked(listProjects).mockReset();
  vi.mocked(getProjectById).mockReset();
  vi.mocked(assertProjectAccessible).mockReset();
});

describe('ProjectController.listProjects', () => {
  it("un dipendente vede solo i progetti a lui assegnati (assignedToUserId passato al service)", async () => {
    vi.mocked(listProjects).mockResolvedValue([]);
    const controller = new ProjectController();

    await controller.listProjects(makeRequest(makeUser({ role: 'employee', id: 'emp-1', companyId: 'company-1' })));

    expect(listProjects).toHaveBeenCalledWith('company-1', 'emp-1');
  });

  it.each(['owner', 'manager'] as const)(
    'un %s vede tutti i progetti della company (nessun filtro per utente)',
    async (role) => {
      vi.mocked(listProjects).mockResolvedValue([]);
      const controller = new ProjectController();

      await controller.listProjects(makeRequest(makeUser({ role, companyId: 'company-1' })));

      expect(listProjects).toHaveBeenCalledWith('company-1');
      expect(listProjects).not.toHaveBeenCalledWith('company-1', expect.anything());
    },
  );
});

describe('ProjectController.getProject', () => {
  it('applica assertProjectAccessible dopo il recupero: un dipendente non assegnato riceve 404 (non i dati del progetto) anche se il progetto esiste nella sua company', async () => {
    vi.mocked(getProjectById).mockResolvedValue({ id: 'p1', name: 'Progetto', isActive: true });
    vi.mocked(assertProjectAccessible).mockRejectedValue(new ProjectNotFoundError('p1'));
    const controller = new ProjectController();
    controller.setStatus = vi.fn();

    const result = await controller.getProject('p1', makeRequest(makeUser({ role: 'employee', companyId: 'company-1' })));

    expect(assertProjectAccessible).toHaveBeenCalledWith('p1', expect.objectContaining({ role: 'employee' }));
    expect(controller.setStatus).toHaveBeenCalledWith(404);
    expect(result).toMatchObject({ message: expect.any(String) });
  });
});
