import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import EditEmployeeModalComponent from "./editEmployeeModalComponent";

describe("EditEmployeeModalComponent", () => {
  it("precompiles the username field with the current username", () => {
    render(
      <EditEmployeeModalComponent
        isOpen
        onClose={() => {}}
        currentUsername="dipendente1"
        onSave={() => {}}
      />,
    );

    expect(screen.getByDisplayValue("dipendente1")).toBeInTheDocument();
  });

  it("shows an error and does not call onSave when submitting an empty username", async () => {
    const onSave = vi.fn();
    render(
      <EditEmployeeModalComponent
        isOpen
        onClose={() => {}}
        currentUsername="dipendente1"
        onSave={onSave}
      />,
    );

    fireEvent.change(screen.getByDisplayValue("dipendente1"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByText("Salva"));

    expect(await screen.findByText("Inserire uno username.")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("calls onSave with only the trimmed username when the password fields are left empty", async () => {
    const onSave = vi.fn();
    render(
      <EditEmployeeModalComponent
        isOpen
        onClose={() => {}}
        currentUsername="dipendente1"
        onSave={onSave}
      />,
    );

    fireEvent.change(screen.getByDisplayValue("dipendente1"), {
      target: { value: "  nuovoNome  " },
    });
    fireEvent.click(screen.getByText("Salva"));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith({
      username: "nuovoNome",
      password: undefined,
    });
  });

  it("shows an error when a new password does not meet the policy", async () => {
    render(
      <EditEmployeeModalComponent
        isOpen
        onClose={() => {}}
        currentUsername="dipendente1"
        onSave={() => {}}
      />,
    );

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
    render(
      <EditEmployeeModalComponent
        isOpen
        onClose={() => {}}
        currentUsername="dipendente1"
        onSave={onSave}
      />,
    );

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
    render(
      <EditEmployeeModalComponent
        isOpen
        onClose={() => {}}
        currentUsername="dipendente1"
        onSave={onSave}
      />,
    );

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
      password: "Password1",
    });
  });

  it("calls onClose when the cancel button is clicked", () => {
    const onClose = vi.fn();
    render(
      <EditEmployeeModalComponent
        isOpen
        onClose={onClose}
        currentUsername="dipendente1"
        onSave={() => {}}
      />,
    );

    fireEvent.click(screen.getByText("Annulla"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("displays the submitError passed from the parent", () => {
    render(
      <EditEmployeeModalComponent
        isOpen
        onClose={() => {}}
        currentUsername="dipendente1"
        onSave={() => {}}
        submitError="Username già in uso."
      />,
    );

    expect(screen.getByText("Username già in uso.")).toBeInTheDocument();
  });
});
