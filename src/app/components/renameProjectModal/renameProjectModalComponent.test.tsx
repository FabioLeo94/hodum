import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import RenameProjectModalComponent from "./renameProjectModalComponent";

describe("RenameProjectModalComponent", () => {
  it("precompiles the name field with the current project name", () => {
    render(
      <RenameProjectModalComponent
        isOpen
        onClose={() => {}}
        currentName="Progetto Demo"
        onRename={() => {}}
      />,
    );

    expect(screen.getByDisplayValue("Progetto Demo")).toBeInTheDocument();
  });

  it("shows an error and does not call onRename when submitting an empty name", async () => {
    const onRename = vi.fn();
    render(
      <RenameProjectModalComponent
        isOpen
        onClose={() => {}}
        currentName="Progetto Demo"
        onRename={onRename}
      />,
    );

    fireEvent.change(screen.getByDisplayValue("Progetto Demo"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByText("Salva"));

    expect(
      await screen.findByText("Inserisci un nome per il progetto."),
    ).toBeInTheDocument();
    expect(onRename).not.toHaveBeenCalled();
  });

  it("calls onRename with the trimmed name when submitting a valid name", async () => {
    const onRename = vi.fn();
    render(
      <RenameProjectModalComponent
        isOpen
        onClose={() => {}}
        currentName="Progetto Demo"
        onRename={onRename}
      />,
    );

    fireEvent.change(screen.getByDisplayValue("Progetto Demo"), {
      target: { value: "  Nuovo Nome  " },
    });
    fireEvent.click(screen.getByText("Salva"));

    await waitFor(() => expect(onRename).toHaveBeenCalledTimes(1));
    expect(onRename).toHaveBeenCalledWith("Nuovo Nome");
  });

  it("disables the confirm button while onRename is pending", async () => {
    let resolveRename: () => void = () => {};
    const onRename = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRename = resolve;
        }),
    );
    render(
      <RenameProjectModalComponent
        isOpen
        onClose={() => {}}
        currentName="Progetto Demo"
        onRename={onRename}
      />,
    );

    fireEvent.click(screen.getByText("Salva"));

    const confirmButton = await screen.findByRole("button", {
      name: "Salvataggio in corso...",
    });
    expect(confirmButton).toBeDisabled();

    resolveRename();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Salva" })).not.toBeDisabled(),
    );
  });
});
