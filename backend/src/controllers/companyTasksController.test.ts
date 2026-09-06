import type { Request as ExRequest } from 'express';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { User } from '../models/user';

vi.mock('../services/taskService', () => ({
  listTasksByCompany: vi.fn(),
}));

import { listTasksByCompany } from '../services/taskService';
import { CompanyTasksController } from './companyTasksController';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    username: 'mario',
    email: 'mario@example.com',
    companyId: 'company-1',
    role: 'employee',
    firstName: 'Mario',
    lastName: 'Rossi',
    pronoun: null,
    mustChangePassword: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastLoginAt: null,
    disabledAt: null,
    ...overrides,
  };
}

function makeRequest(user: User): ExRequest {
  return { user } as unknown as ExRequest;
}

beforeEach(() => {
  vi.mocked(listTasksByCompany).mockReset().mockResolvedValue([]);
});

describe('CompanyTasksController.listCompanyTasks: vista calendario aggregata', () => {
  it('un dipendente vede solo i task dei progetti a cui è assegnato', async () => {
    const controller = new CompanyTasksController();

    await controller.listCompanyTasks(makeRequest(makeUser({ role: 'employee', id: 'emp-1', companyId: 'company-1' })));

    expect(listTasksByCompany).toHaveBeenCalledWith('company-1', 'emp-1');
  });

  it.each(['owner', 'manager'] as const)('un %s vede tutti i task della company', async (role) => {
    const controller = new CompanyTasksController();

    await controller.listCompanyTasks(makeRequest(makeUser({ role, companyId: 'company-1' })));

    expect(listTasksByCompany).toHaveBeenCalledWith('company-1');
    expect(listTasksByCompany).not.toHaveBeenCalledWith('company-1', expect.anything());
  });
});
