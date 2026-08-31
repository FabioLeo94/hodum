import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  login,
  persistSession,
  isAuthenticated,
  getToken,
  getUser,
  updateStoredUser,
  logout,
  AUTH_TOKEN_KEY,
  AUTH_USER_KEY,
  type User,
} from "./authService";

function jsonResponse(status: number, body: unknown = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

const sampleUser: User = {
  id: "1",
  username: "demo",
  email: "demo@taskmanager.dev",
  companyId: "10",
  role: "owner",
  mustChangePassword: false,
};

describe("authService", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("login", () => {
    it("invia una POST JSON a /auth/login e risolve { user, token } su credenziali valide", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(200, {
          user: sampleUser,
          token: "signed-jwt-token",
        }),
      );

      await expect(
        login("demo@taskmanager.dev", "demo1234"),
      ).resolves.toEqual({ user: sampleUser, token: "signed-jwt-token" });

      const [url, options] = vi.mocked(fetch).mock.calls[0];
      expect(url).toBe("http://localhost:3000/auth/login");
      expect(options?.method).toBe("POST");
      expect(JSON.parse(options?.body as string)).toEqual({
        email: "demo@taskmanager.dev",
        password: "demo1234",
      });
    });

    it("risolve null per credenziali non valide (401)", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(401, { message: "Email o password non corretti" }),
      );

      await expect(login("demo@taskmanager.dev", "wrong")).resolves.toBeNull();
    });
  });

  describe("persistSession", () => {
    it("stores the token and the user in sessionStorage and localStorage when rememberMe is true", () => {
      persistSession("signed-jwt-token", sampleUser, true);
      expect(sessionStorage.getItem(AUTH_TOKEN_KEY)).toBe("signed-jwt-token");
      expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBe("signed-jwt-token");
      expect(sessionStorage.getItem(AUTH_USER_KEY)).toBe(JSON.stringify(sampleUser));
      expect(localStorage.getItem(AUTH_USER_KEY)).toBe(JSON.stringify(sampleUser));
    });

    it("does not write to localStorage when rememberMe is false", () => {
      persistSession("signed-jwt-token", sampleUser, false);
      expect(sessionStorage.getItem(AUTH_TOKEN_KEY)).toBe("signed-jwt-token");
      expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
      expect(sessionStorage.getItem(AUTH_USER_KEY)).toBe(JSON.stringify(sampleUser));
      expect(localStorage.getItem(AUTH_USER_KEY)).toBeNull();
    });
  });

  describe("getToken", () => {
    it("returns the token from sessionStorage when present", () => {
      sessionStorage.setItem(AUTH_TOKEN_KEY, "session-token");
      expect(getToken()).toBe("session-token");
    });

    it("falls back to localStorage when sessionStorage is empty", () => {
      localStorage.setItem(AUTH_TOKEN_KEY, "local-token");
      expect(getToken()).toBe("local-token");
    });

    it("returns null when no token is stored", () => {
      expect(getToken()).toBeNull();
    });
  });

  describe("getUser", () => {
    it("returns the user from sessionStorage when present", () => {
      sessionStorage.setItem(AUTH_USER_KEY, JSON.stringify(sampleUser));
      expect(getUser()).toEqual(sampleUser);
    });

    it("falls back to localStorage when sessionStorage is empty", () => {
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(sampleUser));
      expect(getUser()).toEqual(sampleUser);
    });

    it("returns null when no user is stored", () => {
      expect(getUser()).toBeNull();
    });

    it("returns null when the stored value is not valid JSON", () => {
      sessionStorage.setItem(AUTH_USER_KEY, "not-json");
      expect(getUser()).toBeNull();
    });
  });

  describe("updateStoredUser", () => {
    it("always writes to sessionStorage", () => {
      updateStoredUser(sampleUser);
      expect(sessionStorage.getItem(AUTH_USER_KEY)).toBe(JSON.stringify(sampleUser));
      expect(localStorage.getItem(AUTH_USER_KEY)).toBeNull();
    });

    it("mirrors to localStorage when the token already lives there", () => {
      localStorage.setItem(AUTH_TOKEN_KEY, "signed-jwt-token");
      const updatedUser: User = { ...sampleUser, mustChangePassword: false };

      updateStoredUser(updatedUser);

      expect(localStorage.getItem(AUTH_USER_KEY)).toBe(JSON.stringify(updatedUser));
    });
  });

  describe("isAuthenticated", () => {
    it("returns true when a token is stored", () => {
      localStorage.setItem(AUTH_TOKEN_KEY, "signed-jwt-token");
      expect(isAuthenticated()).toBe(true);
    });

    it("returns false when no token is stored", () => {
      expect(isAuthenticated()).toBe(false);
    });
  });

  describe("logout", () => {
    it("removes the token and the user from both storages", () => {
      sessionStorage.setItem(AUTH_TOKEN_KEY, "signed-jwt-token");
      localStorage.setItem(AUTH_TOKEN_KEY, "signed-jwt-token");
      sessionStorage.setItem(AUTH_USER_KEY, JSON.stringify(sampleUser));
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(sampleUser));
      logout();
      expect(sessionStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
      expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
      expect(sessionStorage.getItem(AUTH_USER_KEY)).toBeNull();
      expect(localStorage.getItem(AUTH_USER_KEY)).toBeNull();
    });
  });
});
