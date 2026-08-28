import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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

  it("shows an error and does not call onCreate when submitting an empty name", async () => {
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
      await screen.findByText("Inserisci un nome per il progetto."),
    ).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("calls onCreate with the trimmed name when submitting a valid name", async () => {
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

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate).toHaveBeenCalledWith("Progetto Nuovo");
  });

  it("calls onCreate when the form is submitted (e.g. pressing Enter in the name field), not only on button click", async () => {
    const onCreate = vi.fn();
    render(
      <CreateProjectModalComponent
        isOpen
        onClose={() => {}}
        onCreate={onCreate}
      />,
    );

    const input = screen.getByPlaceholderText("Es. Redesign sito web");
    fireEvent.change(input, { target: { value: "Progetto da tastiera" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate).toHaveBeenCalledWith("Progetto da tastiera");
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

  it("disables the confirm button and shows a loading label while onCreate is pending", async () => {
    let resolveCreate: () => void = () => {};
    const onCreate = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveCreate = resolve;
        }),
    );
    render(
      <CreateProjectModalComponent
        isOpen
        onClose={() => {}}
        onCreate={onCreate}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Es. Redesign sito web"), {
      target: { value: "Progetto Nuovo" },
    });
    fireEvent.click(screen.getByText("Crea progetto"));

    const confirmButton = await screen.findByRole("button", {
      name: "Creazione in corso...",
    });
    expect(confirmButton).toBeDisabled();
    expect(onCreate).toHaveBeenCalledTimes(1);

    resolveCreate();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Crea progetto" }),
      ).not.toBeDisabled(),
    );
  });

  it("re-enables the confirm button after onCreate rejects so the user can retry", async () => {
    const onCreate = vi.fn().mockRejectedValue(new Error("boom"));
    render(
      <CreateProjectModalComponent
        isOpen
        onClose={() => {}}
        onCreate={onCreate}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Es. Redesign sito web"), {
      target: { value: "Progetto Nuovo" },
    });
    fireEvent.click(screen.getByText("Crea progetto"));

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Crea progetto" }),
      ).not.toBeDisabled(),
    );
  });
});
