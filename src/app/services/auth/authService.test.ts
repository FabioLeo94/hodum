import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  login,
  persistSession,
  isAuthenticated,
  logout,
  AUTH_STORAGE_KEY,
} from "./authService";

function jsonResponse(status: number, body: unknown = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

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
    it("invia una POST JSON a /auth/login e risolve true su credenziali valide", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(200, { id: "1", username: "demo", email: "demo@taskmanager.dev" }),
      );

      await expect(
        login("demo@taskmanager.dev", "demo1234"),
      ).resolves.toBe(true);

      const [url, options] = vi.mocked(fetch).mock.calls[0];
      expect(url).toBe("http://localhost:3000/auth/login");
      expect(options?.method).toBe("POST");
      expect(JSON.parse(options?.body as string)).toEqual({
        email: "demo@taskmanager.dev",
        password: "demo1234",
      });
    });

    it("risolve false per credenziali non valide (401)", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(401, { message: "Email o password non corretti" }),
      );

      await expect(login("demo@taskmanager.dev", "wrong")).resolves.toBe(
        false,
      );
    });
  });

  describe("persistSession", () => {
    it("stores true in localStorage when rememberMe is true", () => {
      persistSession(true);
      expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBe("true");
    });

    it("does not write to localStorage when rememberMe is false", () => {
      persistSession(false);
      expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    });
  });

  describe("isAuthenticated", () => {
    it("returns true when the session flag is set", () => {
      localStorage.setItem(AUTH_STORAGE_KEY, "true");
      expect(isAuthenticated()).toBe(true);
    });

    it("returns false when the session flag is missing", () => {
      expect(isAuthenticated()).toBe(false);
    });
  });

  describe("logout", () => {
    it("removes the session flag from localStorage", () => {
      localStorage.setItem(AUTH_STORAGE_KEY, "true");
      logout();
      expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    });
  });
});
