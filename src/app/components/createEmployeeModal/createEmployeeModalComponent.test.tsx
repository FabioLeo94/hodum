import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CreateEmployeeModalComponent from "./createEmployeeModalComponent";

function fillValidForm() {
  fireEvent.change(screen.getByPlaceholderText("Nome"), {
    target: { value: "Dipendente" },
  });
  fireEvent.change(screen.getByPlaceholderText("Cognome"), {
    target: { value: "Uno" },
  });
  fireEvent.change(screen.getByPlaceholderText("Username"), {
    target: { value: "dipendente1" },
  });
  fireEvent.change(screen.getByPlaceholderText("Email"), {
    target: { value: "dipendente1@example.com" },
  });
  fireEvent.change(screen.getByPlaceholderText("Password iniziale"), {
    target: { value: "Password1" },
  });
  fireEvent.change(screen.getByPlaceholderText("Conferma password iniziale"), {
    target: { value: "Password1" },
  });
}

describe("CreateEmployeeModalComponent", () => {
  it("does not open the dialog when isOpen is false", () => {
    render(
      <CreateEmployeeModalComponent
        isOpen={false}
        onClose={() => {}}
        onCreate={() => {}}
      />,
    );

    expect(screen.getByRole("dialog", { hidden: true })).not.toHaveAttribute(
      "open",
    );
  });

  it("renders the title and the form fields when open", () => {
    render(
      <CreateEmployeeModalComponent
        isOpen
        onClose={() => {}}
        onCreate={() => {}}
      />,
    );

    expect(screen.getByText("Nuovo dipendente")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Username")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Email")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Password iniziale")).toBeInTheDocument();
  });

  it("shows validation errors and does not call onCreate when submitting an empty form", async () => {
    const onCreate = vi.fn();
    render(
      <CreateEmployeeModalComponent
        isOpen
        onClose={() => {}}
        onCreate={onCreate}
      />,
    );

    fireEvent.click(screen.getByText("Crea dipendente"));

    expect(await screen.findByText("Inserire il nome.")).toBeInTheDocument();
    expect(screen.getByText("Inserire il cognome.")).toBeInTheDocument();
    expect(screen.getByText("Inserire una email valida.")).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("shows an error when the two password fields do not match", async () => {
    render(
      <CreateEmployeeModalComponent
        isOpen
        onClose={() => {}}
        onCreate={() => {}}
      />,
    );

    fillValidForm();
    fireEvent.change(screen.getByPlaceholderText("Conferma password iniziale"), {
      target: { value: "Different1" },
    });
    fireEvent.click(screen.getByText("Crea dipendente"));

    expect(
      await screen.findByText("Le password non coincidono."),
    ).toBeInTheDocument();
  });

  it("calls onCreate with the trimmed username and the form values when valid", async () => {
    const onCreate = vi.fn();
    render(
      <CreateEmployeeModalComponent
        isOpen
        onClose={() => {}}
        onCreate={onCreate}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Nome"), {
      target: { value: "Dipendente" },
    });
    fireEvent.change(screen.getByPlaceholderText("Cognome"), {
      target: { value: "Uno" },
    });
    fireEvent.change(screen.getByPlaceholderText("Username"), {
      target: { value: "  dipendente1  " },
    });
    fireEvent.change(screen.getByPlaceholderText("Email"), {
      target: { value: "dipendente1@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password iniziale"), {
      target: { value: "Password1" },
    });
    fireEvent.change(screen.getByPlaceholderText("Conferma password iniziale"), {
      target: { value: "Password1" },
    });
    fireEvent.click(screen.getByText("Crea dipendente"));

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate).toHaveBeenCalledWith({
      username: "dipendente1",
      firstName: "Dipendente",
      lastName: "Uno",
      pronoun: undefined,
      email: "dipendente1@example.com",
      password: "Password1",
      role: "employee",
    });
  });

  it("calls onCreate with username omitted when the field is left empty", async () => {
    const onCreate = vi.fn();
    render(
      <CreateEmployeeModalComponent
        isOpen
        onClose={() => {}}
        onCreate={onCreate}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Nome"), {
      target: { value: "Dipendente" },
    });
    fireEvent.change(screen.getByPlaceholderText("Cognome"), {
      target: { value: "Uno" },
    });
    fireEvent.change(screen.getByPlaceholderText("Email"), {
      target: { value: "dipendente1@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password iniziale"), {
      target: { value: "Password1" },
    });
    fireEvent.change(screen.getByPlaceholderText("Conferma password iniziale"), {
      target: { value: "Password1" },
    });
    fireEvent.click(screen.getByText("Crea dipendente"));

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ username: undefined }),
    );
  });

  it("calls onCreate with role 'manager' when Project Manager is selected", async () => {
    const onCreate = vi.fn();
    render(
      <CreateEmployeeModalComponent
        isOpen
        onClose={() => {}}
        onCreate={onCreate}
      />,
    );

    fillValidForm();
    fireEvent.change(screen.getByLabelText("Ruolo"), {
      target: { value: "manager" },
    });
    fireEvent.click(screen.getByText("Crea dipendente"));

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ role: "manager" }),
    );
  });

  it("calls onClose when the cancel button is clicked", () => {
    const onClose = vi.fn();
    render(
      <CreateEmployeeModalComponent
        isOpen
        onClose={onClose}
        onCreate={() => {}}
      />,
    );

    fireEvent.click(screen.getByText("Annulla"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("displays the submitError passed from the parent", () => {
    render(
      <CreateEmployeeModalComponent
        isOpen
        onClose={() => {}}
        onCreate={() => {}}
        submitError="Username o email già in uso."
      />,
    );

    expect(
      screen.getByText("Username o email già in uso."),
    ).toBeInTheDocument();
  });

  it("re-enables the confirm button after onCreate rejects so the user can retry", async () => {
    const onCreate = vi.fn().mockRejectedValue(new Error("boom"));
    render(
      <CreateEmployeeModalComponent
        isOpen
        onClose={() => {}}
        onCreate={onCreate}
      />,
    );

    fillValidForm();
    fireEvent.click(screen.getByText("Crea dipendente"));

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Crea dipendente" }),
      ).not.toBeDisabled(),
    );
  });
});
