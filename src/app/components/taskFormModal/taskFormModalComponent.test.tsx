import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import TaskFormModalComponent from "./taskFormModalComponent";

describe("TaskFormModalComponent", () => {
  it("does not open the dialog when isOpen is false", () => {
    render(
      <TaskFormModalComponent
        isOpen={false}
        projectId="project-1"
        onClose={() => {}}
        onSubmit={() => {}}
      />,
    );

    expect(screen.getByRole("dialog", { hidden: true })).not.toHaveAttribute(
      "open",
    );
  });

  it("renders the title and the fields when open", () => {
    render(
      <TaskFormModalComponent
        isOpen
        projectId="project-1"
        onClose={() => {}}
        onSubmit={() => {}}
      />,
    );

    expect(screen.getByText("Nuovo task")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Es. Sistemare il bug di login"),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Es. Il form non valida l'email"),
    ).toBeInTheDocument();
  });

  it("shows an error and does not call onSubmit when submitting an empty title", async () => {
    const onSubmit = vi.fn();
    render(
      <TaskFormModalComponent
        isOpen
        projectId="project-1"
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByText("Crea task"));

    expect(
      await screen.findByText("Inserisci un titolo per il task."),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("calls onSubmit with the trimmed title and description when submitting valid values", async () => {
    const onSubmit = vi.fn();
    render(
      <TaskFormModalComponent
        isOpen
        projectId="project-1"
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(
      screen.getByPlaceholderText("Es. Sistemare il bug di login"),
      { target: { value: "  Task Nuovo  " } },
    );
    fireEvent.change(
      screen.getByPlaceholderText("Es. Il form non valida l'email"),
      { target: { value: "  Descrizione  " } },
    );
    fireEvent.click(screen.getByText("Crea task"));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      "Task Nuovo",
      "Descrizione",
      "progress",
      5,
      null,
    );
  });

  it("calls onSubmit with an empty description when it is left blank", async () => {
    const onSubmit = vi.fn();
    render(
      <TaskFormModalComponent
        isOpen
        projectId="project-1"
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(
      screen.getByPlaceholderText("Es. Sistemare il bug di login"),
      { target: { value: "Task senza descrizione" } },
    );
    fireEvent.click(screen.getByText("Crea task"));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      "Task senza descrizione",
      "",
      "progress",
      5,
      null,
    );
  });

  it("calls onSubmit when the form is submitted (e.g. pressing Enter in the title field), not only on button click", async () => {
    const onSubmit = vi.fn();
    render(
      <TaskFormModalComponent
        isOpen
        projectId="project-1"
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    );

    const input = screen.getByPlaceholderText("Es. Sistemare il bug di login");
    fireEvent.change(input, { target: { value: "Task da tastiera" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      "Task da tastiera",
      "",
      "progress",
      5,
      null,
    );
  });

  it("renders status and priority selects with their defaults", () => {
    render(
      <TaskFormModalComponent
        isOpen
        projectId="project-1"
        onClose={() => {}}
        onSubmit={() => {}}
      />,
    );

    expect(
      screen.getByRole("combobox", { name: "Stato di nuovo task" }),
    ).toHaveValue("progress");
    expect(
      screen.getByRole("combobox", { name: "Priorità di nuovo task" }),
    ).toHaveValue("5");
  });

  it("calls onSubmit with the status and priority chosen via the selects", async () => {
    const onSubmit = vi.fn();
    render(
      <TaskFormModalComponent
        isOpen
        projectId="project-1"
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(
      screen.getByPlaceholderText("Es. Sistemare il bug di login"),
      { target: { value: "Task Nuovo" } },
    );
    fireEvent.change(
      screen.getByRole("combobox", { name: "Stato di Task Nuovo" }),
      { target: { value: "review" } },
    );
    fireEvent.change(
      screen.getByRole("combobox", { name: "Priorità di Task Nuovo" }),
      { target: { value: "1" } },
    );
    fireEvent.click(screen.getByText("Crea task"));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith("Task Nuovo", "", "review", 1, null);
  });

  it("calls onSubmit with the due date chosen in the date field", async () => {
    const onSubmit = vi.fn();
    render(
      <TaskFormModalComponent
        isOpen
        projectId="project-1"
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(
      screen.getByPlaceholderText("Es. Sistemare il bug di login"),
      { target: { value: "Task Nuovo" } },
    );
    fireEvent.change(screen.getByLabelText("Data di scadenza"), {
      target: { value: "2026-09-10" },
    });
    fireEvent.click(screen.getByText("Crea task"));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      "Task Nuovo",
      "",
      "progress",
      5,
      "2026-09-10",
    );
  });

  it("calls onClose when the cancel button is clicked", () => {
    const onClose = vi.fn();
    render(
      <TaskFormModalComponent
        isOpen
        projectId="project-1"
        onClose={onClose}
        onSubmit={() => {}}
      />,
    );

    fireEvent.click(screen.getByText("Annulla"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("disables the confirm button and shows a loading label while onSubmit is pending", async () => {
    let resolveSubmit: () => void = () => {};
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSubmit = resolve;
        }),
    );
    render(
      <TaskFormModalComponent
        isOpen
        projectId="project-1"
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(
      screen.getByPlaceholderText("Es. Sistemare il bug di login"),
      { target: { value: "Task Nuovo" } },
    );
    fireEvent.click(screen.getByText("Crea task"));

    const confirmButton = await screen.findByRole("button", {
      name: "Creazione in corso...",
    });
    expect(confirmButton).toBeDisabled();
    expect(onSubmit).toHaveBeenCalledTimes(1);

    resolveSubmit();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Crea task" }),
      ).not.toBeDisabled(),
    );
  });

  it("re-enables the confirm button after onSubmit rejects so the user can retry", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("boom"));
    render(
      <TaskFormModalComponent
        isOpen
        projectId="project-1"
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(
      screen.getByPlaceholderText("Es. Sistemare il bug di login"),
      { target: { value: "Task Nuovo" } },
    );
    fireEvent.click(screen.getByText("Crea task"));

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Crea task" }),
      ).not.toBeDisabled(),
    );
  });

  describe("edit mode", () => {
    it("renders the edit title, description and pre-filled fields", () => {
      render(
        <TaskFormModalComponent
          isOpen
          mode="edit"
          initialTitle="Task esistente"
          initialDescription="Descrizione esistente"
          projectId="project-1"
        onClose={() => {}}
          onSubmit={() => {}}
        />,
      );

      expect(screen.getByText("Modifica task")).toBeInTheDocument();
      expect(
        screen.getByText("Aggiorna titolo e descrizione del task."),
      ).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText("Es. Sistemare il bug di login"),
      ).toHaveValue("Task esistente");
      expect(
        screen.getByPlaceholderText("Es. Il form non valida l'email"),
      ).toHaveValue("Descrizione esistente");
      expect(
        screen.getByRole("button", { name: "Salva modifiche" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("combobox", { name: /^Stato di/ }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("combobox", { name: /^Priorità di/ }),
      ).not.toBeInTheDocument();
    });

    it("pre-fills the due date field with initialDueDate", () => {
      render(
        <TaskFormModalComponent
          isOpen
          mode="edit"
          initialTitle="Task esistente"
          initialDueDate="2026-09-10"
          projectId="project-1"
          onClose={() => {}}
          onSubmit={() => {}}
        />,
      );

      expect(screen.getByLabelText("Data di scadenza")).toHaveValue(
        "2026-09-10",
      );
    });

    it("calls onSubmit with null after clearing a pre-filled due date", async () => {
      const onSubmit = vi.fn();
      render(
        <TaskFormModalComponent
          isOpen
          mode="edit"
          initialTitle="Task esistente"
          initialDueDate="2026-09-10"
          projectId="project-1"
          onClose={() => {}}
          onSubmit={onSubmit}
        />,
      );

      fireEvent.change(screen.getByLabelText("Data di scadenza"), {
        target: { value: "" },
      });
      fireEvent.click(screen.getByText("Salva modifiche"));

      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      expect(onSubmit).toHaveBeenCalledWith(
        "Task esistente",
        "",
        "progress",
        5,
        null,
      );
    });

    it("calls onSubmit with the edited values, not the initial ones", async () => {
      const onSubmit = vi.fn();
      render(
        <TaskFormModalComponent
          isOpen
          mode="edit"
          initialTitle="Task esistente"
          initialDescription="Descrizione esistente"
          projectId="project-1"
        onClose={() => {}}
          onSubmit={onSubmit}
        />,
      );

      const titleInput = screen.getByPlaceholderText(
        "Es. Sistemare il bug di login",
      );
      fireEvent.change(titleInput, { target: { value: "Task modificato" } });
      const descriptionInput = screen.getByPlaceholderText(
        "Es. Il form non valida l'email",
      );
      fireEvent.change(descriptionInput, {
        target: { value: "Descrizione modificata" },
      });
      fireEvent.click(screen.getByText("Salva modifiche"));

      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      expect(onSubmit).toHaveBeenCalledWith(
        "Task modificato",
        "Descrizione modificata",
        "progress",
        5,
        null,
      );
    });

    it("shows the pending label while saving", async () => {
      let resolveSubmit: () => void = () => {};
      const onSubmit = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveSubmit = resolve;
          }),
      );
      render(
        <TaskFormModalComponent
          isOpen
          mode="edit"
          initialTitle="Task esistente"
          projectId="project-1"
        onClose={() => {}}
          onSubmit={onSubmit}
        />,
      );

      fireEvent.click(screen.getByText("Salva modifiche"));

      expect(
        await screen.findByRole("button", { name: "Salvataggio in corso..." }),
      ).toBeDisabled();

      resolveSubmit();
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "Salva modifiche" }),
        ).not.toBeDisabled(),
      );
    });
  });
});
