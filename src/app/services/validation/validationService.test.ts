import { describe, it, expect } from "vitest";
import { validateEmail, validatePassword } from "./validationService";

describe("validationService", () => {
  describe("validateEmail", () => {
    it("accepts a well-formed email", () => {
      expect(validateEmail("user@example.com")).toBe(true);
    });

    it("rejects an email without a domain", () => {
      expect(validateEmail("user@")).toBe(false);
    });

    it("rejects a string without an @", () => {
      expect(validateEmail("userexample.com")).toBe(false);
    });
  });

  describe("validatePassword", () => {
    it("accepts a password with upper, lower, digit and min length", () => {
      expect(validatePassword("Passw0rd")).toBe(true);
    });

    it("rejects a password shorter than the minimum length", () => {
      expect(validatePassword("Pw0")).toBe(false);
    });

    it("rejects a password without an uppercase letter", () => {
      expect(validatePassword("password0")).toBe(false);
    });
  });
});
