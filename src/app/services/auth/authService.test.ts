import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  login,
  persistSession,
  isAuthenticated,
  getToken,
  logout,
  AUTH_TOKEN_KEY,
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
    it("invia una POST JSON a /auth/login e risolve il token su credenziali valide", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(200, {
          user: { id: "1", username: "demo", email: "demo@taskmanager.dev" },
          token: "signed-jwt-token",
        }),
      );

      await expect(
        login("demo@taskmanager.dev", "demo1234"),
      ).resolves.toBe("signed-jwt-token");

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
    it("stores the token in sessionStorage and localStorage when rememberMe is true", () => {
      persistSession("signed-jwt-token", true);
      expect(sessionStorage.getItem(AUTH_TOKEN_KEY)).toBe("signed-jwt-token");
      expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBe("signed-jwt-token");
    });

    it("does not write to localStorage when rememberMe is false", () => {
      persistSession("signed-jwt-token", false);
      expect(sessionStorage.getItem(AUTH_TOKEN_KEY)).toBe("signed-jwt-token");
      expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
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
    it("removes the token from both storages", () => {
      sessionStorage.setItem(AUTH_TOKEN_KEY, "signed-jwt-token");
      localStorage.setItem(AUTH_TOKEN_KEY, "signed-jwt-token");
      logout();
      expect(sessionStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
      expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
    });
  });
});
