import type { Request as ExRequest } from 'express';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { User } from '../models/user';

vi.mock('../services/companyService', () => ({
  createEmployee: vi.fn(),
  getCompanyById: vi.fn(),
  registerCompany: vi.fn(),
  updateCompany: vi.fn(),
}));
vi.mock('../services/tokenService', () => ({
  signSessionToken: vi.fn(),
}));
vi.mock('../services/userService', () => ({
  UserConflictError: class UserConflictError extends Error {},
}));

import { createEmployee, getCompanyById, updateCompany as updateCompanyService } from '../services/companyService';
import { CompanyController } from './companyController';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'owner-1',
    username: 'owner',
    email: 'owner@example.com',
    companyId: 'company-1',
    role: 'owner',
    mustChangePassword: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastLoginAt: null,
    ...overrides,
  };
}

function makeRequest(user: User): ExRequest {
  return { user } as unknown as ExRequest;
}

function controllerWithStatus() {
  const controller = new CompanyController();
  controller.setStatus = vi.fn();
  return controller;
}

beforeEach(() => {
  vi.mocked(getCompanyById).mockReset();
  vi.mocked(updateCompanyService).mockReset();
  vi.mocked(createEmployee).mockReset();
});

describe('CompanyController.getCompany: scoping sulla company del richiedente', () => {
  it("un utente NON vede i dati di un'altra company passandone semplicemente l'id nel path (IDOR)", async () => {
    const controller = controllerWithStatus();

    const result = await controller.getCompany('company-di-un-altro', makeRequest(makeUser({ companyId: 'company-1' })));

    expect(controller.setStatus).toHaveBeenCalledWith(404);
    expect(result).toMatchObject({ message: expect.any(String) });
    expect(getCompanyById).not.toHaveBeenCalled();
  });

  it('un dipendente vede i dati della propria company (non è riservato a owner/manager)', async () => {
    vi.mocked(getCompanyById).mockResolvedValue({ id: 'company-1', name: 'Acme' } as never);
    const controller = controllerWithStatus();

    const result = await controller.getCompany(
      'company-1',
      makeRequest(makeUser({ role: 'employee', companyId: 'company-1' })),
    );

    expect(result).toMatchObject({ id: 'company-1' });
  });
});

describe("CompanyController.updateCompany: riservato all'owner e alla propria company", () => {
  it("rifiuta l'aggiornamento se l'id nel path non è la company del richiedente, prima ancora di validare il body", async () => {
    const controller = controllerWithStatus();

    const result = await controller.updateCompany(
      'company-di-un-altro',
      { name: 'Nome nuovo' },
      makeRequest(makeUser({ role: 'owner', companyId: 'company-1' })),
    );

    expect(controller.setStatus).toHaveBeenCalledWith(404);
    expect(result).toMatchObject({ message: expect.any(String) });
    expect(updateCompanyService).not.toHaveBeenCalled();
  });

  it('applica la modifica quando id combacia con la company del richiedente', async () => {
    vi.mocked(updateCompanyService).mockResolvedValue({ id: 'company-1', name: 'Nome nuovo' } as never);
    const controller = controllerWithStatus();

    await controller.updateCompany('company-1', { name: 'Nome nuovo' }, makeRequest(makeUser({ role: 'owner', companyId: 'company-1' })));

    expect(updateCompanyService).toHaveBeenCalledWith('company-1', expect.objectContaining({ name: 'Nome nuovo' }));
  });
});

describe('CompanyController.createEmployee: creazione dipendenti riservata alla propria company', () => {
  it("un owner non può creare un dipendente per un'altra company passandone l'id nel path", async () => {
    const controller = controllerWithStatus();

    const result = await controller.createEmployee(
      'company-di-un-altro',
      { username: 'nuovo', email: 'n@example.com', password: 'Password1' },
      makeRequest(makeUser({ role: 'owner', companyId: 'company-1' })),
    );

    expect(controller.setStatus).toHaveBeenCalledWith(404);
    expect(result).toMatchObject({ message: expect.any(String) });
    expect(createEmployee).not.toHaveBeenCalled();
  });

  it('crea il dipendente nella company del richiedente quando id combacia', async () => {
    vi.mocked(createEmployee).mockResolvedValue(makeUser({ id: 'nuovo-dipendente', role: 'employee' }));
    const controller = controllerWithStatus();

    await controller.createEmployee(
      'company-1',
      { username: 'nuovo', email: 'n@example.com', password: 'Password1' },
      makeRequest(makeUser({ role: 'owner', companyId: 'company-1' })),
    );

    expect(createEmployee).toHaveBeenCalledWith(
      'company-1',
      expect.objectContaining({ username: 'nuovo', email: 'n@example.com' }),
    );
  });
});
