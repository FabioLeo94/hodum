import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import DeleteProjectModalComponent from "./deleteProjectModalComponent";

describe("DeleteProjectModalComponent", () => {
  it("shows the project name in the confirmation copy", () => {
    render(
      <DeleteProjectModalComponent
        isOpen
        onClose={() => {}}
        projectName="Progetto Demo"
        onConfirm={() => {}}
      />,
    );

    expect(screen.getByText(/Progetto Demo/)).toBeInTheDocument();
  });

  it("calls onConfirm when the delete button is clicked", async () => {
    const onConfirm = vi.fn();
    render(
      <DeleteProjectModalComponent
        isOpen
        onClose={() => {}}
        projectName="Progetto Demo"
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
      <DeleteProjectModalComponent
        isOpen
        onClose={() => {}}
        projectName="Progetto Demo"
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

  it("calls onClose when the cancel button is clicked", () => {
    const onClose = vi.fn();
    render(
      <DeleteProjectModalComponent
        isOpen
        onClose={onClose}
        projectName="Progetto Demo"
        onConfirm={() => {}}
      />,
    );

    fireEvent.click(screen.getByText("Annulla"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
