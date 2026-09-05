import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createEmployee, updateCompany } from "./companyService";
import { AUTH_TOKEN_KEY } from "../auth/authService";
import type { WorkDays, WorkHours } from "../../../shared/utils/rateConversion";

const NO_WORK_DAYS: WorkDays = {
  lunedi: false,
  martedi: false,
  mercoledi: false,
  giovedi: false,
  venerdi: false,
  sabato: false,
  domenica: false,
};
const NO_WORK_HOURS: WorkHours = {
  continuativo: true,
  inizio1: null,
  fine1: null,
  inizio2: null,
  fine2: null,
};

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

const updatedCompany = {
  id: "10",
  name: "Azienda Srl",
  ownerId: "1",
  ragioneSociale: "Azienda Società a responsabilità limitata",
  piva: "12345678901",
  codiceFiscale: "12345678901",
  indirizzo: "Via Roma 1, Milano",
  pec: "azienda@pec.it",
  tariffaOraria: null,
  tariffaUnita: null,
  giorniLavorativi: NO_WORK_DAYS,
  orarioLavoro: NO_WORK_HOURS,
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("companyService.updateCompany", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("invia una PUT JSON con il token di sessione e risolve l'azienda aggiornata", async () => {
    sessionStorage.setItem(AUTH_TOKEN_KEY, "signed-jwt-token");
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, updatedCompany));

    const input = {
      name: "Azienda Srl",
      ragioneSociale: "Azienda Società a responsabilità limitata",
      piva: "12345678901",
      codiceFiscale: "12345678901",
      indirizzo: "Via Roma 1, Milano",
      pec: "azienda@pec.it",
      tariffaOraria: null,
      tariffaUnita: null,
      giorniLavorativi: NO_WORK_DAYS,
      orarioLavoro: NO_WORK_HOURS,
    };

    await expect(updateCompany("10", input)).resolves.toEqual(updatedCompany);

    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("http://localhost:3000/companies/10");
    expect(options?.method).toBe("PUT");
    expect(options?.headers).toMatchObject({
      "Content-Type": "application/json",
      Authorization: "Bearer signed-jwt-token",
    });
    expect(JSON.parse(options?.body as string)).toEqual(input);
  });

  it("lancia un errore con il messaggio del backend su 422", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(422, { message: "piva deve essere composta da 11 cifre" }),
    );

    await expect(
      updateCompany("10", {
        name: "Azienda Srl",
        ragioneSociale: null,
        piva: "123",
        codiceFiscale: null,
        indirizzo: null,
        pec: null,
        tariffaOraria: null,
        tariffaUnita: null,
        giorniLavorativi: NO_WORK_DAYS,
        orarioLavoro: NO_WORK_HOURS,
      }),
    ).rejects.toThrow("piva deve essere composta da 11 cifre");
  });

  it("lancia un errore generico di fallback per altri status non ok", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(404));

    await expect(
      updateCompany("10", {
        name: "Azienda Srl",
        ragioneSociale: null,
        piva: null,
        codiceFiscale: null,
        indirizzo: null,
        pec: null,
        tariffaOraria: null,
        tariffaUnita: null,
        giorniLavorativi: NO_WORK_DAYS,
        orarioLavoro: NO_WORK_HOURS,
      }),
    ).rejects.toThrow("Impossibile salvare i dati aziendali.");
  });
});
