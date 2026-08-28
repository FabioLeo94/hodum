import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createUser } from "./userService";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe("userService", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("createUser", () => {
    it("invia una POST JSON a /users con i soli 3 campi previsti dal contratto", async () => {
      const created = { id: "1", username: "mario", email: "mario@example.com" };
      vi.mocked(fetch).mockResolvedValue(jsonResponse(201, created));

      const result = await createUser({
        username: "mario",
        email: "mario@example.com",
        password: "Password1",
      });

      expect(result).toEqual(created);
      const [url, options] = vi.mocked(fetch).mock.calls[0];
      expect(url).toBe("http://localhost:3000/users");
      expect(options?.method).toBe("POST");
      expect(JSON.parse(options?.body as string)).toEqual({
        username: "mario",
        email: "mario@example.com",
        password: "Password1",
      });
    });

    it("lancia un errore specifico per un conflitto 409 (username o email già in uso)", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(409, { message: "Username già in uso." }),
      );

      await expect(
        createUser({
          username: "mario",
          email: "mario@example.com",
          password: "Password1",
        }),
      ).rejects.toThrow("Username già in uso.");
    });

    it("lancia un errore generico per una risposta 422 senza corpo leggibile", async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 422,
        json: () => Promise.reject(new Error("no body")),
      } as unknown as Response);

      await expect(
        createUser({
          username: "",
          email: "not-an-email",
          password: "short",
        }),
      ).rejects.toThrow("Dati non validi. Controlla i campi inseriti.");
    });
  });
});
