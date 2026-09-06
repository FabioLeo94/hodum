import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import EditEmployeeModalComponent from "./editEmployeeModalComponent";

function renderModal(overrides: Partial<Parameters<typeof EditEmployeeModalComponent>[0]> = {}) {
  return render(
    <EditEmployeeModalComponent
      isOpen
      onClose={() => {}}
      currentUsername="dipendente1"
      currentFirstName="Nome"
      currentLastName="Cognome"
      currentPronoun={null}
      currentRole="employee"
      currentCreatedAt="2026-01-01T00:00:00.000Z"
      currentLastLoginAt={null}
      onSave={() => {}}
      {...overrides}
    />,
  );
}

describe("EditEmployeeModalComponent", () => {
  it("precompiles the username, first name and last name fields with the current values", () => {
    renderModal();

    expect(screen.getByDisplayValue("dipendente1")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Nome")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Cognome")).toBeInTheDocument();
  });

  it("shows validation errors and does not call onSave when submitting empty first/last name", async () => {
    const onSave = vi.fn();
    renderModal({ onSave });

    fireEvent.change(screen.getByDisplayValue("Nome"), { target: { value: "   " } });
    fireEvent.change(screen.getByDisplayValue("Cognome"), { target: { value: "   " } });
    fireEvent.click(screen.getByText("Salva"));

    expect(await screen.findByText("Inserire il nome.")).toBeInTheDocument();
    expect(screen.getByText("Inserire il cognome.")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("calls onSave with the trimmed fields when the password fields are left empty", async () => {
    const onSave = vi.fn();
    renderModal({ onSave });

    fireEvent.change(screen.getByDisplayValue("dipendente1"), {
      target: { value: "  nuovoNome  " },
    });
    fireEvent.click(screen.getByText("Salva"));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith({
      username: "nuovoNome",
      firstName: "Nome",
      lastName: "Cognome",
      pronoun: undefined,
      password: undefined,
      role: "employee",
    });
  });

  it("calls onSave with username omitted when the field is cleared, without blocking submit", async () => {
    const onSave = vi.fn();
    renderModal({ onSave });

    fireEvent.change(screen.getByDisplayValue("dipendente1"), { target: { value: "" } });
    fireEvent.click(screen.getByText("Salva"));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ username: undefined }),
    );
  });

  it("shows an error when a new password does not meet the policy", async () => {
    renderModal();

    fireEvent.change(screen.getByPlaceholderText("Nuova password (opzionale)"), {
      target: { value: "weak" },
    });

    expect(
      await screen.findByText(
        "La password deve contenere almeno 8 caratteri, una minuscola, una maiuscola e un numero.",
      ),
    ).toBeInTheDocument();
  });

  it("shows an error when the two password fields do not match", async () => {
    const onSave = vi.fn();
    renderModal({ onSave });

    fireEvent.change(screen.getByPlaceholderText("Nuova password (opzionale)"), {
      target: { value: "Password1" },
    });
    fireEvent.change(screen.getByPlaceholderText("Conferma nuova password"), {
      target: { value: "Different1" },
    });
    fireEvent.click(screen.getByText("Salva"));

    expect(
      await screen.findByText("Le password non coincidono."),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("calls onSave with the new password when it is valid and confirmed", async () => {
    const onSave = vi.fn();
    renderModal({ onSave });

    fireEvent.change(screen.getByPlaceholderText("Nuova password (opzionale)"), {
      target: { value: "Password1" },
    });
    fireEvent.change(screen.getByPlaceholderText("Conferma nuova password"), {
      target: { value: "Password1" },
    });
    fireEvent.click(screen.getByText("Salva"));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith({
      username: "dipendente1",
      firstName: "Nome",
      lastName: "Cognome",
      pronoun: undefined,
      password: "Password1",
      role: "employee",
    });
  });

  it("precompiles the role select with currentRole and allows changing it", async () => {
    const onSave = vi.fn();
    renderModal({ currentRole: "manager", onSave });

    expect(screen.getByLabelText("Ruolo")).toHaveValue("manager");

    fireEvent.change(screen.getByLabelText("Ruolo"), {
      target: { value: "employee" },
    });
    fireEvent.click(screen.getByText("Salva"));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ role: "employee" }),
    );
  });

  it("calls onClose when the cancel button is clicked", () => {
    const onClose = vi.fn();
    renderModal({ onClose });

    fireEvent.click(screen.getByText("Annulla"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("displays the submitError passed from the parent", () => {
    renderModal({ submitError: "Username già in uso." });

    expect(screen.getByText("Username già in uso.")).toBeInTheDocument();
  });

  it("shows the formatted creation date and last login when present", () => {
    renderModal({ currentLastLoginAt: "2026-02-15T09:30:00.000Z" });

    expect(screen.getByText("Creato il")).toBeInTheDocument();
    expect(screen.getByText("Ultimo accesso")).toBeInTheDocument();
    expect(screen.queryByText("Mai")).not.toBeInTheDocument();
  });

  it("shows 'Mai' when the employee never logged in", () => {
    renderModal({ currentLastLoginAt: null });

    expect(screen.getByText("Mai")).toBeInTheDocument();
  });
});
