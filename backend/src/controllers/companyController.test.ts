import type { Request as ExRequest } from 'express';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { User } from '../models/user';

vi.mock('../services/companyService', () => ({
  createEmployee: vi.fn(),
  deleteCompany: vi.fn(),
  getCompanyById: vi.fn(),
  ImportCompanyDataError: class ImportCompanyDataError extends Error {},
  importCompanyData: vi.fn(),
  InvalidCompanyDataError: class InvalidCompanyDataError extends Error {},
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
  ImportCompanyDataError,
  importCompanyData,
  InvalidCompanyDataError,
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

  // Punto 1 della code review "niente logica nei controller": la validazione
  // di dati anagrafici/tariffa/orario è stata spostata in
  // companyService.updateCompany (vedi companyService.test.ts per i casi di
  // validazione veri e propri). Qui si verifica solo che il controller
  // mappi l'errore del service a 422, non la logica di validazione stessa.
  it('un InvalidCompanyDataError dal service risponde 422, non 500', async () => {
    vi.mocked(updateCompanyService).mockRejectedValue(new InvalidCompanyDataError('piva deve essere composta da 11 cifre'));
    const controller = controllerWithStatus();

    const result = await controller.updateCompany(
      'company-1',
      { name: 'Acme', piva: '123' },
      makeRequest(makeUser({ role: 'owner', companyId: 'company-1' })),
    );

    expect(controller.setStatus).toHaveBeenCalledWith(422);
    expect(result).toMatchObject({ message: expect.any(String) });
  });
});

describe('CompanyController.createEmployee: creazione dipendenti riservata alla propria company', () => {
  it("un owner non può creare un dipendente per un'altra company passandone l'id nel path", async () => {
    const controller = controllerWithStatus();

    const result = await controller.createEmployee(
      'company-di-un-altro',
      { username: 'nuovo', email: 'n@example.com', password: 'Password1', firstName: 'Luigi', lastName: 'Bianchi' },
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
      { username: 'nuovo', email: 'n@example.com', password: 'Password1', firstName: 'Luigi', lastName: 'Bianchi' },
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

// Punto 1 della code review "niente logica nei controller": la validazione
// del payload (ex validateImportPayload qui) è stata spostata in
// companyService.importCompanyData (vedi companyService.test.ts per i casi
// di validazione veri e propri, tra cui "ownerPassword debole" e "nessun
// owner con id uguale a company.ownerId"). Qui si verifica solo che il
// controller mappi ImportCompanyDataError a 422 e il resto del comportamento
// (successo, conflitto), non la logica di validazione stessa.
describe('CompanyController.importCompany: rotta pubblica, delega la validazione al service', () => {
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

  it('un ImportCompanyDataError dal service risponde 422, non 500', async () => {
    vi.mocked(importCompanyData).mockRejectedValue(new ImportCompanyDataError('ownerPassword non valida'));
    const controller = controllerWithStatus();

    const result = await controller.importCompany({ export: makeValidExport(), ownerPassword: 'debole' } as never);

    expect(controller.setStatus).toHaveBeenCalledWith(422);
    expect(result).toMatchObject({ message: expect.any(String) });
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
