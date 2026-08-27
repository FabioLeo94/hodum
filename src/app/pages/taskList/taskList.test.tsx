import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import TaskList from "./taskList";

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
  it("mostra il progetto trovato con i task raggruppati per stato", () => {
    renderAt("/dashboard/1/task-list");

    expect(screen.getByText("Progetto Demo")).toBeInTheDocument();
    expect(screen.getByText("In corso (2)")).toBeInTheDocument();
    expect(screen.getByText("In review (1)")).toBeInTheDocument();
    expect(screen.getByText("Completati (0)")).toBeInTheDocument();
    expect(screen.getByText("Rifiutati (0)")).toBeInTheDocument();
    expect(screen.getByText("FIX: rendering auth form")).toBeInTheDocument();
    expect(screen.getByText("FEAT: creazione form clienti")).toBeInTheDocument();
    expect(screen.getByText("FIX: colore primario mancante")).toBeInTheDocument();
  });

  it("mostra un messaggio di errore se il progetto non esiste", () => {
    renderAt("/dashboard/id-inesistente/task-list");

    expect(screen.getByText("Progetto non trovato.")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Torna alla dashboard" }),
    ).toBeInTheDocument();
  });
});
