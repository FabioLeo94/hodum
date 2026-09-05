import type { Request as ExRequest } from 'express';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { User } from '../models/user';

vi.mock('../services/companyService', () => ({
  createEmployee: vi.fn(),
  deleteCompany: vi.fn(),
  getCompanyById: vi.fn(),
  importCompanyData: vi.fn(),
  registerCompany: vi.fn(),
  updateCompany: vi.fn(),
}));
vi.mock('../services/exportService', () => ({
  exportCompanyData: vi.fn(),
}));
vi.mock('../services/tokenService', () => ({
  signSessionToken: vi.fn(),
}));
vi.mock('../services/userService', () => ({
  UserConflictError: class UserConflictError extends Error {},
}));

import {
  createEmployee,
  deleteCompany as deleteCompanyService,
  getCompanyById,
  importCompanyData,
  updateCompany as updateCompanyService,
} from '../services/companyService';
import { exportCompanyData } from '../services/exportService';
import { UserConflictError } from '../services/userService';
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
  vi.mocked(exportCompanyData).mockReset();
  vi.mocked(deleteCompanyService).mockReset();
  vi.mocked(importCompanyData).mockReset();
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

describe("CompanyController.exportCompany: scoping sulla company del richiedente", () => {
  it("un owner NON esporta i dati di un'altra company passandone l'id nel path (IDOR)", async () => {
    const controller = controllerWithStatus();

    const result = await controller.exportCompany(
      'company-di-un-altro',
      makeRequest(makeUser({ role: 'owner', companyId: 'company-1' })),
    );

    expect(controller.setStatus).toHaveBeenCalledWith(404);
    expect(result).toMatchObject({ message: expect.any(String) });
    expect(exportCompanyData).not.toHaveBeenCalled();
  });

  it('esporta i dati quando id combacia con la company del richiedente', async () => {
    vi.mocked(exportCompanyData).mockResolvedValue({ company: { id: 'company-1' } } as never);
    const controller = controllerWithStatus();

    const result = await controller.exportCompany('company-1', makeRequest(makeUser({ role: 'owner', companyId: 'company-1' })));

    expect(exportCompanyData).toHaveBeenCalledWith('company-1');
    expect(result).toMatchObject({ company: { id: 'company-1' } });
  });
});

describe("CompanyController.deleteCompany: riservato all'owner e alla propria company", () => {
  it("un owner NON elimina un'altra company passandone l'id nel path (IDOR)", async () => {
    const controller = controllerWithStatus();

    await controller.deleteCompany('company-di-un-altro', makeRequest(makeUser({ role: 'owner', companyId: 'company-1' })));

    expect(controller.setStatus).toHaveBeenCalledWith(404);
    expect(deleteCompanyService).not.toHaveBeenCalled();
  });

  it('elimina la company e risponde 204 quando id combacia con la company del richiedente', async () => {
    vi.mocked(deleteCompanyService).mockResolvedValue(undefined);
    const controller = controllerWithStatus();

    await controller.deleteCompany('company-1', makeRequest(makeUser({ id: 'owner-1', role: 'owner', companyId: 'company-1' })));

    expect(deleteCompanyService).toHaveBeenCalledWith('company-1', 'owner-1');
    expect(controller.setStatus).toHaveBeenCalledWith(204);
  });
});

describe('CompanyController.importCompany: validazione del payload prima di aprire la transazione, rotta pubblica', () => {
  function makeValidExport(overrides: Record<string, unknown> = {}) {
    return {
      company: {
        id: 'old-company',
        name: 'Acme',
        ownerId: 'old-owner',
        ragioneSociale: null,
        piva: null,
        codiceFiscale: null,
        indirizzo: null,
        pec: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      users: [
        {
          id: 'old-owner',
          username: 'owner',
          email: 'owner@example.com',
          companyId: 'old-company',
          role: 'owner',
          mustChangePassword: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          lastLoginAt: null,
        },
      ],
      projects: [],
      projectAssignments: [],
      tasks: [],
      comments: [],
      backups: [],
      ...overrides,
    };
  }

  it('risponde 422 senza aprire la transazione se ownerPassword non rispetta la policy', async () => {
    const controller = controllerWithStatus();

    const result = await controller.importCompany({ export: makeValidExport(), ownerPassword: 'debole' } as never);

    expect(controller.setStatus).toHaveBeenCalledWith(422);
    expect(result).toMatchObject({ message: expect.any(String) });
    expect(importCompanyData).not.toHaveBeenCalled();
  });

  it("risponde 422 se l'export non contiene esattamente un owner con id uguale a company.ownerId", async () => {
    const controller = controllerWithStatus();
    const invalidExport = makeValidExport({
      users: [
        {
          id: 'un-altro-id',
          username: 'owner',
          email: 'owner@example.com',
          companyId: 'old-company',
          role: 'owner',
          mustChangePassword: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          lastLoginAt: null,
        },
      ],
    });

    const result = await controller.importCompany({ export: invalidExport, ownerPassword: 'Password1' } as never);

    expect(controller.setStatus).toHaveBeenCalledWith(422);
    expect(result).toMatchObject({ message: expect.any(String) });
    expect(importCompanyData).not.toHaveBeenCalled();
  });

  it('con un payload valido, chiama il service e risponde 201', async () => {
    vi.mocked(importCompanyData).mockResolvedValue({
      user: makeUser({ id: 'new-owner' }),
      company: { id: 'new-company', name: 'Acme' } as never,
      recoveryCode: 'AAAA-BBBB-CCCC-DDDD',
      temporaryPasswords: [],
    });
    const controller = controllerWithStatus();

    const result = await controller.importCompany({ export: makeValidExport(), ownerPassword: 'Password1' } as never);

    expect(importCompanyData).toHaveBeenCalledWith(
      expect.objectContaining({ ownerPassword: 'Password1' }),
    );
    expect(controller.setStatus).toHaveBeenCalledWith(201);
    expect(result).toMatchObject({ recoveryCode: 'AAAA-BBBB-CCCC-DDDD' });
  });

  it('un conflitto username/email sull\'istanza di destinazione risponde 409, non 500', async () => {
    vi.mocked(importCompanyData).mockRejectedValue(new UserConflictError('username già in uso'));
    const controller = controllerWithStatus();

    const result = await controller.importCompany({ export: makeValidExport(), ownerPassword: 'Password1' } as never);

    expect(controller.setStatus).toHaveBeenCalledWith(409);
    expect(result).toMatchObject({ message: expect.any(String) });
  });
});
