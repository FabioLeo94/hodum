import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { changePassword, listUsers } from "./userService";
import { AUTH_TOKEN_KEY } from "../auth/authService";

function jsonResponse(status: number, body: unknown = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

const updatedUser = {
  id: "1",
  username: "demo",
  email: "demo@taskmanager.dev",
  companyId: "10",
  role: "owner" as const,
  mustChangePassword: false,
};

describe("userService", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("listUsers invia una GET con il token di sessione e risolve la lista", async () => {
    sessionStorage.setItem(AUTH_TOKEN_KEY, "signed-jwt-token");
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, [updatedUser]));

    await expect(listUsers()).resolves.toEqual([updatedUser]);

    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("http://localhost:3000/users");
    expect(options?.headers).toMatchObject({
      Authorization: "Bearer signed-jwt-token",
    });
  });

  it("listUsers lancia un errore con il messaggio del backend su status non ok", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(401, { message: "Token di sessione mancante" }),
    );

    await expect(listUsers()).rejects.toThrow("Token di sessione mancante");
  });

  it("invia una PUT JSON con il token di sessione e risolve lo user aggiornato", async () => {
    sessionStorage.setItem(AUTH_TOKEN_KEY, "signed-jwt-token");
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, updatedUser));

    await expect(changePassword("1", "NewPassword1")).resolves.toEqual(updatedUser);

    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("http://localhost:3000/users/1/password");
    expect(options?.method).toBe("PUT");
    expect(options?.headers).toMatchObject({
      "Content-Type": "application/json",
      Authorization: "Bearer signed-jwt-token",
    });
    expect(JSON.parse(options?.body as string)).toEqual({ password: "NewPassword1" });
  });

  it("lancia un errore con il messaggio del backend su 422", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(422, { message: "La password non rispetta i requisiti." }),
    );

    await expect(changePassword("1", "weak")).rejects.toThrow(
      "La password non rispetta i requisiti.",
    );
  });

  it("usa un messaggio di fallback su 422 senza corpo", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(422));

    await expect(changePassword("1", "weak")).rejects.toThrow("Password non valida.");
  });

  it("lancia un errore generico di fallback per altri status non ok", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(404));

    await expect(changePassword("1", "NewPassword1")).rejects.toThrow(
      "Cambio password non riuscito. Riprova più tardi.",
    );
  });
});
