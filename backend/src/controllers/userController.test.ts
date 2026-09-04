import type { Request as ExRequest } from 'express';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { User } from '../models/user';

vi.mock('../services/userService', () => ({
  changePassword: vi.fn(),
  deleteUser: vi.fn(),
  getUserById: vi.fn(),
  listUsers: vi.fn(),
  updateUser: vi.fn(),
  UserConflictError: class UserConflictError extends Error {},
  UserNotFoundError: class UserNotFoundError extends Error {},
}));
vi.mock('../services/projectAssignmentService', () => ({
  EmployeeNotFoundError: class EmployeeNotFoundError extends Error {},
  listAssignedProjects: vi.fn(),
  setProjectAssignments: vi.fn(),
}));
vi.mock('../services/projectService', () => ({
  ProjectNotFoundError: class ProjectNotFoundError extends Error {},
}));

import { deleteUser as deleteUserService, getUserById, updateUser as updateUserService } from '../services/userService';
import { UserController } from './userController';

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

function controllerWithStatus() {
  const controller = new UserController();
  controller.setStatus = vi.fn();
  return controller;
}

beforeEach(() => {
  vi.mocked(getUserById).mockReset();
  vi.mocked(updateUserService).mockReset();
  vi.mocked(deleteUserService).mockReset();
});

describe('UserController.getUser: visibilità cross-utente', () => {
  it('un utente vede sé stesso', async () => {
    vi.mocked(getUserById).mockResolvedValue(makeUser({ id: 'user-1' }));
    const controller = controllerWithStatus();

    const result = await controller.getUser('user-1', makeRequest(makeUser({ id: 'user-1' })));

    expect(result).toMatchObject({ id: 'user-1' });
    expect(controller.setStatus).not.toHaveBeenCalled();
  });

  it('un utente vede un collega della stessa company', async () => {
    vi.mocked(getUserById).mockResolvedValue(makeUser({ id: 'collega', companyId: 'company-1' }));
    const controller = controllerWithStatus();

    const result = await controller.getUser('collega', makeRequest(makeUser({ id: 'user-1', companyId: 'company-1' })));

    expect(result).toMatchObject({ id: 'collega' });
  });

  it("un utente NON vede un utente di un'altra company: 404, non un profilo altrui (IDOR cross-tenant)", async () => {
    vi.mocked(getUserById).mockResolvedValue(makeUser({ id: 'estraneo', companyId: 'altra-company' }));
    const controller = controllerWithStatus();

    const result = await controller.getUser('estraneo', makeRequest(makeUser({ id: 'user-1', companyId: 'company-1' })));

    expect(controller.setStatus).toHaveBeenCalledWith(404);
    expect(result).toMatchObject({ message: expect.any(String) });
  });
});

describe('UserController.updateUser: self-service vs owner-che-modifica-un-dipendente', () => {
  it('il self-service non permette di cambiare il proprio ruolo, anche se il body lo richiede (anti privilege-escalation)', async () => {
    vi.mocked(updateUserService).mockResolvedValue(makeUser({ id: 'user-1' }));
    const controller = controllerWithStatus();

    await controller.updateUser(
      'user-1',
      { role: 'manager' },
      makeRequest(makeUser({ id: 'user-1', role: 'employee' })),
    );

    expect(updateUserService).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ role: undefined, forceChangePassword: false }),
    );
  });

  it('un dipendente non può modificare un altro utente: 404 (non 403, per non confermarne l\'esistenza)', async () => {
    const controller = controllerWithStatus();

    const result = await controller.updateUser(
      'altro-utente',
      { username: 'nuovo-nome' },
      makeRequest(makeUser({ id: 'user-1', role: 'employee' })),
    );

    expect(controller.setStatus).toHaveBeenCalledWith(404);
    expect(result).toMatchObject({ message: expect.any(String) });
    expect(updateUserService).not.toHaveBeenCalled();
  });

  it('un manager non può modificare un altro utente: stessa restrizione di un dipendente, solo l\'owner ha lo scope allargato', async () => {
    const controller = controllerWithStatus();

    const result = await controller.updateUser(
      'altro-utente',
      { username: 'nuovo-nome' },
      makeRequest(makeUser({ id: 'user-1', role: 'manager' })),
    );

    expect(controller.setStatus).toHaveBeenCalledWith(404);
    expect(result).toMatchObject({ message: expect.any(String) });
  });

  it("l'owner può modificare un proprio dipendente, e il ruolo passato nel body arriva al service", async () => {
    vi.mocked(getUserById).mockResolvedValue(makeUser({ id: 'dipendente-1', role: 'employee', companyId: 'company-1' }));
    vi.mocked(updateUserService).mockResolvedValue(makeUser({ id: 'dipendente-1', role: 'manager' }));
    const controller = controllerWithStatus();

    await controller.updateUser(
      'dipendente-1',
      { role: 'manager' },
      makeRequest(makeUser({ id: 'owner-1', role: 'owner', companyId: 'company-1' })),
    );

    expect(updateUserService).toHaveBeenCalledWith(
      'dipendente-1',
      expect.objectContaining({ role: 'manager' }),
    );
  });

  it("l'owner NON può modificare un dipendente di un'altra company (IDOR cross-tenant): 404", async () => {
    vi.mocked(getUserById).mockResolvedValue(makeUser({ id: 'dipendente-1', role: 'employee', companyId: 'altra-company' }));
    const controller = controllerWithStatus();

    const result = await controller.updateUser(
      'dipendente-1',
      { username: 'x' },
      makeRequest(makeUser({ id: 'owner-1', role: 'owner', companyId: 'company-1' })),
    );

    expect(controller.setStatus).toHaveBeenCalledWith(404);
    expect(result).toMatchObject({ message: expect.any(String) });
    expect(updateUserService).not.toHaveBeenCalled();
  });

  it("l'owner NON può modificare un altro owner passando semplicemente il suo id (target.role !== employee/manager): 404", async () => {
    vi.mocked(getUserById).mockResolvedValue(makeUser({ id: 'altro-owner', role: 'owner', companyId: 'company-1' }));
    const controller = controllerWithStatus();

    const result = await controller.updateUser(
      'altro-owner',
      { username: 'x' },
      makeRequest(makeUser({ id: 'owner-1', role: 'owner', companyId: 'company-1' })),
    );

    expect(controller.setStatus).toHaveBeenCalledWith(404);
    expect(result).toMatchObject({ message: expect.any(String) });
  });

  it("un reset password fatto dall'owner forza must_change_password a true sul dipendente", async () => {
    vi.mocked(getUserById).mockResolvedValue(makeUser({ id: 'dipendente-1', role: 'employee', companyId: 'company-1' }));
    vi.mocked(updateUserService).mockResolvedValue(makeUser({ id: 'dipendente-1' }));
    const controller = controllerWithStatus();

    await controller.updateUser(
      'dipendente-1',
      { password: 'NuovaPassword1' },
      makeRequest(makeUser({ id: 'owner-1', role: 'owner', companyId: 'company-1' })),
    );

    expect(updateUserService).toHaveBeenCalledWith(
      'dipendente-1',
      expect.objectContaining({ forceChangePassword: true }),
    );
  });
});

describe('UserController.deleteUser: stessa scope-restriction di updateUser', () => {
  it('un dipendente non può eliminare un altro utente (né sé stesso in questo scenario): 404 silenzioso', async () => {
    const controller = controllerWithStatus();

    await controller.deleteUser('altro-utente', makeRequest(makeUser({ id: 'user-1', role: 'employee' })));

    expect(controller.setStatus).toHaveBeenCalledWith(404);
    expect(deleteUserService).not.toHaveBeenCalled();
  });

  it("l'owner può eliminare un proprio dipendente", async () => {
    vi.mocked(getUserById).mockResolvedValue(makeUser({ id: 'dipendente-1', role: 'employee', companyId: 'company-1' }));
    vi.mocked(deleteUserService).mockResolvedValue(undefined);
    const controller = controllerWithStatus();

    await controller.deleteUser('dipendente-1', makeRequest(makeUser({ id: 'owner-1', role: 'owner', companyId: 'company-1' })));

    expect(deleteUserService).toHaveBeenCalledWith('dipendente-1');
    expect(controller.setStatus).toHaveBeenCalledWith(204);
  });

  it("l'owner NON può eliminare un dipendente di un'altra company", async () => {
    vi.mocked(getUserById).mockResolvedValue(makeUser({ id: 'dipendente-1', role: 'employee', companyId: 'altra-company' }));
    const controller = controllerWithStatus();

    await controller.deleteUser('dipendente-1', makeRequest(makeUser({ id: 'owner-1', role: 'owner', companyId: 'company-1' })));

    expect(controller.setStatus).toHaveBeenCalledWith(404);
    expect(deleteUserService).not.toHaveBeenCalled();
  });

  it('un utente può eliminare sé stesso (self-service)', async () => {
    vi.mocked(deleteUserService).mockResolvedValue(undefined);
    const controller = controllerWithStatus();

    await controller.deleteUser('user-1', makeRequest(makeUser({ id: 'user-1', role: 'employee' })));

    expect(deleteUserService).toHaveBeenCalledWith('user-1');
  });
});
