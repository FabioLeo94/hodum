import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ImportProjectModalComponent from "./importProjectModalComponent";

function makeFile(content: unknown, name = "progetto.json") {
  return new File([JSON.stringify(content)], name, { type: "application/json" });
}

describe("ImportProjectModalComponent", () => {
  it("shows a validation error when submitting without a file", async () => {
    const onImport = vi.fn();
    render(<ImportProjectModalComponent isOpen onClose={() => {}} onImport={onImport} />);

    fireEvent.click(screen.getByText("Importa"));

    expect(await screen.findByRole("alert")).toHaveTextContent("Seleziona un file da importare.");
    expect(onImport).not.toHaveBeenCalled();
  });

  it("rejects a file that isn't valid JSON", async () => {
    const onImport = vi.fn();
    render(<ImportProjectModalComponent isOpen onClose={() => {}} onImport={onImport} />);

    const file = new File(["not json"], "progetto.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText("File del progetto"), { target: { files: [file] } });
    fireEvent.click(screen.getByText("Importa"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Il file selezionato non è un JSON leggibile.",
    );
    expect(onImport).not.toHaveBeenCalled();
  });

  it("rejects a JSON file that doesn't match the exported project structure", async () => {
    const onImport = vi.fn();
    render(<ImportProjectModalComponent isOpen onClose={() => {}} onImport={onImport} />);

    fireEvent.change(screen.getByLabelText("File del progetto"), {
      target: { files: [makeFile({ foo: "bar" })] },
    });
    fireEvent.click(screen.getByText("Importa"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Il file non corrisponde alla struttura di un progetto esportato.",
    );
    expect(onImport).not.toHaveBeenCalled();
  });

  it("parses a valid export and calls onImport, then closes", async () => {
    const onImport = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<ImportProjectModalComponent isOpen onClose={onClose} onImport={onImport} />);

    fireEvent.change(screen.getByLabelText("File del progetto"), {
      target: {
        files: [
          makeFile({
            name: "Progetto Alpha",
            tasks: [{ title: "Task uno", status: "progress" }],
          }),
        ],
      },
    });
    fireEvent.click(screen.getByText("Importa"));

    await waitFor(() =>
      expect(onImport).toHaveBeenCalledWith({
        name: "Progetto Alpha",
        tasks: [
          { title: "Task uno", description: "", status: "progress", priority: 5, dueDate: null },
        ],
      }),
    );
  });

  it("calls onClose when the cancel button is clicked", () => {
    const onClose = vi.fn();
    render(<ImportProjectModalComponent isOpen onClose={onClose} onImport={vi.fn()} />);

    fireEvent.click(screen.getByText("Annulla"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
