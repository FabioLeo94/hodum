import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import EditAccountModalComponent from "./editAccountModalComponent";

function renderModal(overrides: Partial<Parameters<typeof EditAccountModalComponent>[0]> = {}) {
  return render(
    <EditAccountModalComponent
      isOpen
      onClose={() => {}}
      currentUsername="mario.rossi"
      currentFirstName="Mario"
      currentLastName="Rossi"
      currentPronoun={null}
      currentEmail="mario@example.com"
      currentCreatedAt="2026-01-01T00:00:00.000Z"
      isOwner={false}
      onSave={() => {}}
      onExport={() => {}}
      onRequestDelete={() => {}}
      {...overrides}
    />,
  );
}

describe("EditAccountModalComponent", () => {
  it("shows the 'delete my account' button for non-owner roles", () => {
    renderModal({ isOwner: false });
    expect(
      screen.getByRole("button", { name: "Elimina il mio account" }),
    ).toBeInTheDocument();
  });

  it("hides the 'delete my account' button for the owner", () => {
    renderModal({ isOwner: true });
    expect(
      screen.queryByRole("button", { name: "Elimina il mio account" }),
    ).not.toBeInTheDocument();
  });

  it("calls onRequestDelete when the delete button is clicked, without also submitting the form", () => {
    const onRequestDelete = vi.fn();
    const onSave = vi.fn();
    renderModal({ isOwner: false, onRequestDelete, onSave });

    fireEvent.click(screen.getByRole("button", { name: "Elimina il mio account" }));

    expect(onRequestDelete).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("calls onExport when the export button is clicked, without also submitting the form", async () => {
    const onExport = vi.fn().mockResolvedValue(undefined);
    const onSave = vi.fn();
    renderModal({ onExport, onSave });

    fireEvent.click(screen.getByRole("button", { name: "Esporta i miei dati" }));

    await waitFor(() => expect(onExport).toHaveBeenCalledTimes(1));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("shows the export error when provided", () => {
    renderModal({ exportError: "Impossibile esportare i dati." });
    expect(screen.getByText("Impossibile esportare i dati.")).toBeInTheDocument();
  });

  it("shows the profile header with display name, email and creation date", () => {
    renderModal();
    expect(screen.getByText("mario.rossi")).toBeInTheDocument();
    expect(screen.getByText("mario@example.com")).toBeInTheDocument();
    expect(screen.getByText("Creato il")).toBeInTheDocument();
  });

  it("shows the last login when present, and hides it when not provided", () => {
    const { rerender } = renderModal({ currentLastLoginAt: "2026-02-15T09:30:00.000Z" });
    expect(screen.getByText("Ultimo accesso")).toBeInTheDocument();

    rerender(
      <EditAccountModalComponent
        isOpen
        onClose={() => {}}
        currentUsername="mario.rossi"
        currentFirstName="Mario"
        currentLastName="Rossi"
        currentPronoun={null}
        currentEmail="mario@example.com"
        currentCreatedAt="2026-01-01T00:00:00.000Z"
        isOwner={false}
        onSave={() => {}}
        onExport={() => {}}
        onRequestDelete={() => {}}
      />,
    );
    expect(screen.queryByText("Ultimo accesso")).not.toBeInTheDocument();
  });

  it("shows 'Mai' when the account never logged in", () => {
    renderModal({ currentLastLoginAt: null });
    expect(screen.getByText("Mai")).toBeInTheDocument();
  });
});
