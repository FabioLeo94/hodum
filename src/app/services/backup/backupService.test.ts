import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  deleteBackup,
  getBackupSettings,
  listBackups,
  restoreBackup,
  runBackupNow,
  updateBackupSettings,
} from "./backupService";
import { AUTH_TOKEN_KEY } from "../auth/authService";

function jsonResponse(status: number, body: unknown = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

const settings = {
  companyId: "10",
  intervalMinutes: 15,
  maxBackups: 25,
  filenameFormat: "{company}_{date}_{time}_{index}",
  lastBackupAt: null,
};

describe("backupService", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem(AUTH_TOKEN_KEY, "signed-jwt-token");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("getBackupSettings invia il token e risolve le impostazioni", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, settings));

    await expect(getBackupSettings("10")).resolves.toEqual(settings);

    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("http://localhost:3000/companies/10/backups/settings");
    expect(options?.headers).toMatchObject({ Authorization: "Bearer signed-jwt-token" });
  });

  it("updateBackupSettings invia una PUT JSON e risolve le impostazioni aggiornate", async () => {
    const updated = { ...settings, intervalMinutes: 30, maxBackups: 10 };
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, updated));

    await expect(
      updateBackupSettings("10", { intervalMinutes: 30, maxBackups: 10, filenameFormat: settings.filenameFormat }),
    ).resolves.toEqual(updated);

    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("http://localhost:3000/companies/10/backups/settings");
    expect(options?.method).toBe("PUT");
    expect(JSON.parse(options?.body as string)).toEqual({
      intervalMinutes: 30,
      maxBackups: 10,
      filenameFormat: settings.filenameFormat,
    });
  });

  it("updateBackupSettings lancia un errore con il messaggio del backend su 422", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(422, { message: "filenameFormat non valido" }));

    await expect(
      updateBackupSettings("10", { intervalMinutes: 30, maxBackups: 10, filenameFormat: "../etc" }),
    ).rejects.toThrow("filenameFormat non valido");
  });

  it("runBackupNow lancia un errore dedicato su 409 (backup già in corso)", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { message: "Un backup per questa azienda è già in corso" }));

    await expect(runBackupNow("10")).rejects.toThrow("Un backup per questa azienda è già in corso");
  });

  it("listBackups risolve lo storico dei backup", async () => {
    const history = [
      {
        id: "b1",
        companyId: "10",
        filename: "acme_20260904_120000_0001.dump",
        sizeBytes: 2048,
        triggeredBy: "manual" as const,
        createdAt: "2026-09-04T12:00:00.000Z",
      },
    ];
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, history));

    await expect(listBackups("10")).resolves.toEqual(history);
  });

  it("deleteBackup invia una DELETE con il token", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(204));

    await expect(deleteBackup("10", "b1")).resolves.toBeUndefined();

    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("http://localhost:3000/companies/10/backups/b1");
    expect(options?.method).toBe("DELETE");
    expect(options?.headers).toMatchObject({ Authorization: "Bearer signed-jwt-token" });
  });

  it("deleteBackup lancia un errore con il messaggio del backend su 404", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { message: "Backup non trovato" }));

    await expect(deleteBackup("10", "b1")).rejects.toThrow("Backup non trovato");
  });

  it("restoreBackup invia una POST verso l'endpoint restore", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(204));

    await expect(restoreBackup("10", "b1")).resolves.toBeUndefined();

    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("http://localhost:3000/companies/10/backups/b1/restore");
    expect(options?.method).toBe("POST");
  });

  it("restoreBackup lancia un errore dedicato su 409 (backup/ripristino già in corso)", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(409, { message: "Un backup o ripristino per questa azienda è già in corso" }),
    );

    await expect(restoreBackup("10", "b1")).rejects.toThrow(
      "Un backup o ripristino per questa azienda è già in corso",
    );
  });
});
