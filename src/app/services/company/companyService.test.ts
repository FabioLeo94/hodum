import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createEmployee } from "./companyService";
import { AUTH_TOKEN_KEY } from "../auth/authService";

function jsonResponse(status: number, body: unknown = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

const createdEmployee = {
  id: "2",
  username: "dipendente1",
  email: "dipendente1@example.com",
  companyId: "10",
  role: "employee" as const,
  mustChangePassword: true,
};

describe("companyService.createEmployee", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("invia una POST JSON con il token di sessione e risolve il dipendente creato", async () => {
    sessionStorage.setItem(AUTH_TOKEN_KEY, "signed-jwt-token");
    vi.mocked(fetch).mockResolvedValue(jsonResponse(201, createdEmployee));

    await expect(
      createEmployee("10", {
        username: "dipendente1",
        email: "dipendente1@example.com",
        password: "Password1",
      }),
    ).resolves.toEqual(createdEmployee);

    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("http://localhost:3000/companies/10/employees");
    expect(options?.method).toBe("POST");
    expect(options?.headers).toMatchObject({
      "Content-Type": "application/json",
      Authorization: "Bearer signed-jwt-token",
    });
    expect(JSON.parse(options?.body as string)).toEqual({
      username: "dipendente1",
      email: "dipendente1@example.com",
      password: "Password1",
    });
  });

  it("lancia un errore con il messaggio del backend su 409", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(409, { message: "username già in uso" }),
    );

    await expect(
      createEmployee("10", {
        username: "dipendente1",
        email: "dipendente1@example.com",
        password: "Password1",
      }),
    ).rejects.toThrow("username già in uso");
  });

  it("lancia un errore generico di fallback per altri status non ok", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(404));

    await expect(
      createEmployee("10", {
        username: "dipendente1",
        email: "dipendente1@example.com",
        password: "Password1",
      }),
    ).rejects.toThrow("Creazione del dipendente non riuscita. Riprova più tardi.");
  });
});
