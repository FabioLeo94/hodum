import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import DeleteEmployeeModalComponent from "./deleteEmployeeModalComponent";

describe("DeleteEmployeeModalComponent", () => {
  it("shows the employee username in the confirmation copy", () => {
    render(
      <DeleteEmployeeModalComponent
        isOpen
        onClose={() => {}}
        employeeDisplayName="mario.rossi"
        onConfirm={() => {}}
      />,
    );

    expect(screen.getByText(/mario\.rossi/)).toBeInTheDocument();
  });

  it("calls onConfirm when the delete button is clicked", async () => {
    const onConfirm = vi.fn();
    render(
      <DeleteEmployeeModalComponent
        isOpen
        onClose={() => {}}
        employeeDisplayName="mario.rossi"
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByText("Elimina"));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
  });

  it("disables the confirm button and shows a loading label while onConfirm is pending", async () => {
    let resolveConfirm: () => void = () => {};
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveConfirm = resolve;
        }),
    );
    render(
      <DeleteEmployeeModalComponent
        isOpen
        onClose={() => {}}
        employeeDisplayName="mario.rossi"
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByText("Elimina"));

    const confirmButton = await screen.findByRole("button", {
      name: "Eliminazione in corso...",
    });
    expect(confirmButton).toBeDisabled();

    resolveConfirm();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Elimina" }),
      ).not.toBeDisabled(),
    );
  });

  it("shows the submit error when provided", () => {
    render(
      <DeleteEmployeeModalComponent
        isOpen
        onClose={() => {}}
        employeeDisplayName="mario.rossi"
        onConfirm={() => {}}
        submitError="Impossibile eliminare il dipendente."
      />,
    );

    expect(
      screen.getByText("Impossibile eliminare il dipendente."),
    ).toBeInTheDocument();
  });

  it("calls onClose when the cancel button is clicked", () => {
    const onClose = vi.fn();
    render(
      <DeleteEmployeeModalComponent
        isOpen
        onClose={onClose}
        employeeDisplayName="mario.rossi"
        onConfirm={() => {}}
      />,
    );

    fireEvent.click(screen.getByText("Annulla"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
