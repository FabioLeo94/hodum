import type { ComponentProps } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import BackupSettingsDrawerComponent from "./backupSettingsDrawerComponent";
import type { BackupRecord, BackupSettings } from "../../services/backup/backupService";

vi.mock("../../services/backup/backupService", () => ({
  getBackupSettings: vi.fn(),
  updateBackupSettings: vi.fn(),
  listBackups: vi.fn(),
  deleteBackup: vi.fn(),
  restoreBackup: vi.fn(),
  runBackupNow: vi.fn(),
}));

import {
  getBackupSettings,
  listBackups,
  deleteBackup,
} from "../../services/backup/backupService";

function makeSettings(overrides: Partial<BackupSettings> = {}): BackupSettings {
  return {
    companyId: "company-1",
    intervalMinutes: 15,
    maxBackups: 25,
    filenameFormat: "{company}_{date}_{time}_{index}",
    lastBackupAt: null,
    ...overrides,
  };
}

function makeBackup(overrides: Partial<BackupRecord> = {}): BackupRecord {
  return {
    id: "backup-1",
    companyId: "company-1",
    filename: "azienda_20260906_0145.sql",
    sizeBytes: 54_000,
    triggeredBy: "scheduled",
    createdAt: "2026-09-06T01:45:00.000Z",
    ...overrides,
  };
}

function renderDrawer(props: Partial<ComponentProps<typeof BackupSettingsDrawerComponent>> = {}) {
  return render(
    <BackupSettingsDrawerComponent isOpen onClose={vi.fn()} companyId="company-1" {...props} />,
  );
}

beforeEach(() => {
  vi.mocked(getBackupSettings).mockReset();
  vi.mocked(listBackups).mockReset();
  vi.mocked(deleteBackup).mockReset();
  vi.mocked(getBackupSettings).mockResolvedValue(makeSettings());
});

describe("BackupSettingsDrawerComponent - selezione storico", () => {
  it("seleziona un backup cliccando ovunque sulla card, non solo sul quadratino", async () => {
    vi.mocked(listBackups).mockResolvedValue([makeBackup()]);
    renderDrawer();

    const filename = await screen.findByText("azienda_20260906_0145.sql");
    fireEvent.click(filename);

    expect(await screen.findByText("1 selezionato")).toBeInTheDocument();
  });

  it("non seleziona il backup quando si clicca sul menu kebab", async () => {
    vi.mocked(listBackups).mockResolvedValue([makeBackup()]);
    renderDrawer();

    await screen.findByText("azienda_20260906_0145.sql");
    fireEvent.click(screen.getByRole("button", { name: /Altre azioni per/ }));

    expect(screen.queryByText("1 selezionato")).not.toBeInTheDocument();
  });

  it("il checkbox 'seleziona tutto' compare solo a selezione avviata e seleziona/deseleziona tutti i backup", async () => {
    vi.mocked(listBackups).mockResolvedValue([
      makeBackup({ id: "backup-1", filename: "a.sql" }),
      makeBackup({ id: "backup-2", filename: "b.sql" }),
    ]);
    renderDrawer();

    await screen.findByText("a.sql");
    // Nessuna selezione attiva: la checkbox di massa non è ancora nel DOM,
    // solo le card sono selezionabili singolarmente.
    expect(screen.queryByRole("checkbox", { name: "Seleziona tutti i backup" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("a.sql"));
    const selectAll = await screen.findByRole("checkbox", { name: "Seleziona tutti i backup" });

    fireEvent.click(selectAll);
    expect(await screen.findByText("2 selezionati")).toBeInTheDocument();
    expect(selectAll).toBeChecked();

    fireEvent.click(selectAll);
    await waitFor(() => expect(screen.queryByText("1 selezionato")).not.toBeInTheDocument());
    // Deselezionare tutto tramite il checkbox azzera la selezione, quindi la
    // toolbar (checkbox incluso) si richiude come con "Annulla".
    expect(screen.queryByRole("checkbox", { name: "Seleziona tutti i backup" })).not.toBeInTheDocument();
  });

  it("riflette lo stato indeterminato quando solo alcuni backup sono selezionati", async () => {
    vi.mocked(listBackups).mockResolvedValue([
      makeBackup({ id: "backup-1", filename: "a.sql" }),
      makeBackup({ id: "backup-2", filename: "b.sql" }),
    ]);
    renderDrawer();

    fireEvent.click(await screen.findByText("a.sql"));

    const selectAll = (await screen.findByRole("checkbox", {
      name: "Seleziona tutti i backup",
    })) as HTMLInputElement;
    await waitFor(() => expect(selectAll.indeterminate).toBe(true));
  });
});
