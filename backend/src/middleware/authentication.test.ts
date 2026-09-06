import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request } from 'express';
import type { User } from '../models/user';

// Isolati dal vero pool/DB: expressAuthentication dipende solo da questi due
// service, mockati qui per controllare interamente identità e ruolo restituiti
// senza toccare Postgres.
vi.mock('../services/userService', () => ({
  getUserById: vi.fn(),
  UserNotFoundError: class UserNotFoundError extends Error {},
}));
vi.mock('../services/tokenService', () => ({
  verifySessionToken: vi.fn(),
}));

import { getUserById, UserNotFoundError } from '../services/userService';
import { verifySessionToken } from '../services/tokenService';
import {
  expressAuthentication,
  getAuthenticatedUser,
  AuthenticationError,
  AuthorizationError,
  PasswordChangeRequiredError,
} from './authentication';

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

function makeRequest(token?: string): Request {
  return {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  } as unknown as Request;
}

describe('expressAuthentication', () => {
  beforeEach(() => {
    vi.mocked(verifySessionToken).mockReset();
    vi.mocked(getUserById).mockReset();
  });

  it('rifiuta uno schema di sicurezza sconosciuto', async () => {
    await expect(expressAuthentication(makeRequest('t'), 'superadmin')).rejects.toThrow(
      'Schema di sicurezza sconosciuto: superadmin',
    );
  });

  it('rifiuta una richiesta senza header Authorization', async () => {
    await expect(expressAuthentication(makeRequest(), 'jwt')).rejects.toThrow(AuthenticationError);
  });

  it("rifiuta un token il cui utente non esiste più (es. eliminato dopo l'emissione del token)", async () => {
    vi.mocked(verifySessionToken).mockReturnValue({ sub: 'user-1' });
    vi.mocked(getUserById).mockRejectedValue(new UserNotFoundError('user-1'));

    await expect(expressAuthentication(makeRequest('t'), 'jwt')).rejects.toThrow(AuthenticationError);
  });

  describe("schema 'jwt': nessuna restrizione di ruolo", () => {
    it.each(['owner', 'manager', 'employee'] as const)('accetta un utente con ruolo %s', async (role) => {
      vi.mocked(verifySessionToken).mockReturnValue({ sub: 'user-1' });
      vi.mocked(getUserById).mockResolvedValue(makeUser({ role }));

      const request = makeRequest('t');
      const user = await expressAuthentication(request, 'jwt');

      expect(user.role).toBe(role);
      expect(getAuthenticatedUser(request)).toBe(user);
    });
  });

  describe("schema 'owner': riservato al titolare", () => {
    it('accetta un utente owner', async () => {
      vi.mocked(verifySessionToken).mockReturnValue({ sub: 'user-1' });
      vi.mocked(getUserById).mockResolvedValue(makeUser({ role: 'owner' }));

      await expect(expressAuthentication(makeRequest('t'), 'owner')).resolves.toMatchObject({ role: 'owner' });
    });

    it.each(['manager', 'employee'] as const)('rifiuta un utente %s con AuthorizationError (non un 500 generico)', async (role) => {
      vi.mocked(verifySessionToken).mockReturnValue({ sub: 'user-1' });
      vi.mocked(getUserById).mockResolvedValue(makeUser({ role }));

      await expect(expressAuthentication(makeRequest('t'), 'owner')).rejects.toThrow(AuthorizationError);
    });
  });

  describe("schema 'manager': titolare o project manager", () => {
    it.each(['owner', 'manager'] as const)('accetta un utente %s', async (role) => {
      vi.mocked(verifySessionToken).mockReturnValue({ sub: 'user-1' });
      vi.mocked(getUserById).mockResolvedValue(makeUser({ role }));

      await expect(expressAuthentication(makeRequest('t'), 'manager')).resolves.toMatchObject({ role });
    });

    it('rifiuta un dipendente: è esattamente il caso a rischio del task (dipendente su una rotta riservata a manager/owner)', async () => {
      vi.mocked(verifySessionToken).mockReturnValue({ sub: 'user-1' });
      vi.mocked(getUserById).mockResolvedValue(makeUser({ role: 'employee' }));

      await expect(expressAuthentication(makeRequest('t'), 'manager')).rejects.toThrow(AuthorizationError);
    });
  });

  describe('cambio password obbligatorio (must_change_password)', () => {
    it("blocca una rotta 'jwt' con PasswordChangeRequiredError finché la password non viene cambiata", async () => {
      vi.mocked(verifySessionToken).mockReturnValue({ sub: 'user-1' });
      vi.mocked(getUserById).mockResolvedValue(makeUser({ role: 'employee', mustChangePassword: true }));

      await expect(expressAuthentication(makeRequest('t'), 'jwt')).rejects.toThrow(PasswordChangeRequiredError);
    });

    it("lascia passare la rotta 'password-change' anche con must_change_password true (altrimenti nessuna via d'uscita)", async () => {
      vi.mocked(verifySessionToken).mockReturnValue({ sub: 'user-1' });
      vi.mocked(getUserById).mockResolvedValue(makeUser({ role: 'employee', mustChangePassword: true }));

      await expect(expressAuthentication(makeRequest('t'), 'password-change')).resolves.toMatchObject({
        mustChangePassword: true,
      });
    });

    it('un ruolo insufficiente prevale sul cambio password obbligatorio: un dipendente con must_change_password su una rotta owner riceve comunque AuthorizationError', async () => {
      vi.mocked(verifySessionToken).mockReturnValue({ sub: 'user-1' });
      vi.mocked(getUserById).mockResolvedValue(makeUser({ role: 'employee', mustChangePassword: true }));

      await expect(expressAuthentication(makeRequest('t'), 'owner')).rejects.toThrow(AuthorizationError);
    });
  });
});

describe('getAuthenticatedUser', () => {
  it('lancia se chiamato prima che expressAuthentication abbia valorizzato request.user', () => {
    const request = { } as Request;
    expect(() => getAuthenticatedUser(request)).toThrow('Richiesta non autenticata');
  });
});
