import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
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
});
