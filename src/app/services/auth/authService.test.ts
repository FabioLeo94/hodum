import { describe, it, expect, beforeEach } from "vitest";
import {
  login,
  persistSession,
  isAuthenticated,
  AUTH_STORAGE_KEY,
} from "./authService";

describe("authService", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("login", () => {
    it("resolves true for valid mock credentials", async () => {
      await expect(login("demo@taskmanager.dev", "demo1234")).resolves.toBe(
        true,
      );
    });

    it("resolves false for invalid credentials", async () => {
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
});
