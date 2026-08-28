import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import TaskList from "./taskList";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="dashboard/:progettoId/task-list" element={<TaskList />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("TaskList", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("mostra il progetto trovato con i task raggruppati per stato", async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url === "http://localhost:3000/projects/1") {
        return jsonResponse(200, { id: "1", name: "Progetto Demo", isActive: true });
      }
      if (url === "http://localhost:3000/projects/1/tasks") {
        return jsonResponse(200, [
          {
            id: "t1",
            projectId: "1",
            title: "FIX: rendering auth form",
            description: "Il form non renderizza correttamente",
            status: "progress",
          },
          {
            id: "t2",
            projectId: "1",
            title: "FEAT: creazione form clienti",
            description: "Inserire un form per la registrazione dei clienti",
            status: "progress",
          },
          {
            id: "t3",
            projectId: "1",
            title: "FIX: colore primario mancante",
            description: "Il bottone della login non ha il primary come sfondo",
            status: "review",
          },
        ]);
      }
      throw new Error(`URL non atteso: ${url}`);
    });

    renderAt("/dashboard/1/task-list");

    expect(await screen.findByText("Progetto Demo")).toBeInTheDocument();
    expect(screen.getByText("In corso (2)")).toBeInTheDocument();
    expect(screen.getByText("In review (1)")).toBeInTheDocument();
    expect(screen.getByText("Completati (0)")).toBeInTheDocument();
    expect(screen.getByText("Rifiutati (0)")).toBeInTheDocument();
    expect(screen.getByText("FIX: rendering auth form")).toBeInTheDocument();
    expect(screen.getByText("FEAT: creazione form clienti")).toBeInTheDocument();
    expect(screen.getByText("FIX: colore primario mancante")).toBeInTheDocument();
  });

  it("mostra un messaggio di errore se il progetto non esiste", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(404, { message: "Project non trovato" }),
    );

    renderAt("/dashboard/id-inesistente/task-list");

    expect(await screen.findByText("Progetto non trovato.")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Torna alla dashboard" }),
    ).toBeInTheDocument();
  });

  it("mostra un menu a tendina per lo stato di ogni task", async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url === "http://localhost:3000/projects/1") {
        return jsonResponse(200, { id: "1", name: "Progetto Demo", isActive: true });
      }
      if (url === "http://localhost:3000/projects/1/tasks") {
        return jsonResponse(200, [
          {
            id: "t1",
            projectId: "1",
            title: "FIX: rendering auth form",
            description: "Il form non renderizza correttamente",
            status: "progress",
          },
        ]);
      }
      throw new Error(`URL non atteso: ${url}`);
    });

    renderAt("/dashboard/1/task-list");

    expect(await screen.findByText("Progetto Demo")).toBeInTheDocument();
    expect(screen.getByText("Stato")).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Stato di FIX: rendering auth form" }),
    ).toHaveValue("progress");
  });

  it("crea un nuovo task tramite il bottone + e lo mostra in tabella", async () => {
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "http://localhost:3000/projects/1" && !init) {
        return jsonResponse(200, { id: "1", name: "Progetto Demo", isActive: true });
      }
      if (url === "http://localhost:3000/projects/1/tasks" && (!init || init.method === "GET")) {
        return jsonResponse(200, []);
      }
      if (url === "http://localhost:3000/projects/1/tasks" && init?.method === "POST") {
        return jsonResponse(201, {
          id: "t-new",
          projectId: "1",
          title: "Task di prova",
          description: "Descrizione del nuovo task",
          status: "progress",
        });
      }
      throw new Error(`URL non atteso: ${url}`);
    });

    renderAt("/dashboard/1/task-list");

    expect(await screen.findByText("Progetto Demo")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Crea nuovo task" }));
    fireEvent.change(
      screen.getByPlaceholderText("Es. Sistemare il bug di login"),
      { target: { value: "Task di prova" } },
    );
    fireEvent.change(
      screen.getByPlaceholderText("Es. Il form non valida l'email"),
      { target: { value: "Descrizione del nuovo task" } },
    );
    fireEvent.click(screen.getByText("Crea task"));

    expect(await screen.findByText("Task di prova")).toBeInTheDocument();
    expect(screen.getByText("In corso (1)")).toBeInTheDocument();
  });

  it("modifica un task tramite il click sul titolo, riusando il form di creazione", async () => {
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "http://localhost:3000/projects/1" && !init) {
        return jsonResponse(200, { id: "1", name: "Progetto Demo", isActive: true });
      }
      if (url === "http://localhost:3000/projects/1/tasks" && (!init || init.method === "GET")) {
        return jsonResponse(200, [
          {
            id: "t1",
            projectId: "1",
            title: "FIX: rendering auth form",
            description: "Il form non renderizza correttamente",
            status: "progress",
          },
        ]);
      }
      if (
        url === "http://localhost:3000/projects/1/tasks/t1" &&
        init?.method === "PUT"
      ) {
        return jsonResponse(200, {
          id: "t1",
          projectId: "1",
          title: "FIX: rendering auth form (aggiornato)",
          description: "Descrizione aggiornata",
          status: "progress",
        });
      }
      throw new Error(`URL non atteso: ${url}`);
    });

    renderAt("/dashboard/1/task-list");

    expect(await screen.findByText("Progetto Demo")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "FIX: rendering auth form" }),
    );

    expect(screen.getByText("Modifica task")).toBeInTheDocument();
    const titleInput = screen.getByPlaceholderText(
      "Es. Sistemare il bug di login",
    );
    const descriptionInput = screen.getByPlaceholderText(
      "Es. Il form non valida l'email",
    );
    expect(titleInput).toHaveValue("FIX: rendering auth form");
    expect(descriptionInput).toHaveValue("Il form non renderizza correttamente");

    fireEvent.change(titleInput, {
      target: { value: "FIX: rendering auth form (aggiornato)" },
    });
    fireEvent.change(descriptionInput, {
      target: { value: "Descrizione aggiornata" },
    });
    fireEvent.click(screen.getByText("Salva modifiche"));

    expect(
      await screen.findByText("FIX: rendering auth form (aggiornato)"),
    ).toBeInTheDocument();
    expect(screen.getByText("Descrizione aggiornata")).toBeInTheDocument();
    expect(
      screen.queryByText("FIX: rendering auth form"),
    ).not.toBeInTheDocument();
  });

  it("cambia lo stato di un task tramite il menu a tendina e lo sposta di gruppo", async () => {
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "http://localhost:3000/projects/1" && !init) {
        return jsonResponse(200, { id: "1", name: "Progetto Demo", isActive: true });
      }
      if (url === "http://localhost:3000/projects/1/tasks" && (!init || init.method === "GET")) {
        return jsonResponse(200, [
          {
            id: "t1",
            projectId: "1",
            title: "FIX: rendering auth form",
            description: "Il form non renderizza correttamente",
            status: "progress",
          },
        ]);
      }
      if (
        url === "http://localhost:3000/projects/1/tasks/t1/status" &&
        init?.method === "PATCH"
      ) {
        return jsonResponse(200, {
          id: "t1",
          projectId: "1",
          title: "FIX: rendering auth form",
          description: "Il form non renderizza correttamente",
          status: "completed",
        });
      }
      throw new Error(`URL non atteso: ${url}`);
    });

    renderAt("/dashboard/1/task-list");

    expect(await screen.findByText("Progetto Demo")).toBeInTheDocument();
    expect(screen.getByText("In corso (1)")).toBeInTheDocument();

    const select = screen.getByRole("combobox", {
      name: "Stato di FIX: rendering auth form",
    });
    fireEvent.change(select, { target: { value: "completed" } });

    await waitFor(() =>
      expect(screen.getByText("Completati (1)")).toBeInTheDocument(),
    );
    expect(screen.getByText("In corso (0)")).toBeInTheDocument();
  });
});
