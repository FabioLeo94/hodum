import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CreateProjectModalComponent from "./createProjectModalComponent";

describe("CreateProjectModalComponent", () => {
  it("does not open the dialog when isOpen is false", () => {
    render(
      <CreateProjectModalComponent
        isOpen={false}
        onClose={() => {}}
        onCreate={() => {}}
      />,
    );

    expect(screen.getByRole("dialog", { hidden: true })).not.toHaveAttribute(
      "open",
    );
  });

  it("renders the title and the name field when open", () => {
    render(
      <CreateProjectModalComponent
        isOpen
        onClose={() => {}}
        onCreate={() => {}}
      />,
    );

    expect(screen.getByText("Nuovo progetto")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Es. Redesign sito web"),
    ).toBeInTheDocument();
  });

  it("shows an error and does not call onCreate when submitting an empty name", () => {
    const onCreate = vi.fn();
    render(
      <CreateProjectModalComponent
        isOpen
        onClose={() => {}}
        onCreate={onCreate}
      />,
    );

    fireEvent.click(screen.getByText("Crea progetto"));

    expect(
      screen.getByText("Inserisci un nome per il progetto."),
    ).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("calls onCreate with the trimmed name when submitting a valid name", () => {
    const onCreate = vi.fn();
    render(
      <CreateProjectModalComponent
        isOpen
        onClose={() => {}}
        onCreate={onCreate}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Es. Redesign sito web"), {
      target: { value: "  Progetto Nuovo  " },
    });
    fireEvent.click(screen.getByText("Crea progetto"));

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate).toHaveBeenCalledWith("Progetto Nuovo");
  });

  it("calls onClose when the cancel button is clicked", () => {
    const onClose = vi.fn();
    render(
      <CreateProjectModalComponent
        isOpen
        onClose={onClose}
        onCreate={() => {}}
      />,
    );

    fireEvent.click(screen.getByText("Annulla"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
