import type { ReactElement } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import TaskDetailModalComponent from "./taskDetailModalComponent";
import { listTaskComments } from "../../services/project/projectService";
import type { TaskWithProject } from "../../../shared/types/project";

// Stesse dipendenze di taskCommentsPanelComponent.tsx (montato sempre da
// questa modale): mockate qui perché il pannello commenti fa fetch/socket
// reali al mount, irrilevanti per verificare il comportamento di sola
// lettura di TaskDetailModalComponent.
vi.mock("../../services/project/projectService", () => ({
  listTaskComments: vi.fn(),
  createTaskComment: vi.fn(),
  updateTaskComment: vi.fn(),
  deleteTaskComment: vi.fn(),
}));
vi.mock("../../services/realtime/socketService", () => ({
  subscribeToTaskComments: vi.fn(() => () => {}),
}));
vi.mock("../../services/auth/authService", () => ({
  getUser: vi.fn(() => undefined),
}));

const mockedListTaskComments = vi.mocked(listTaskComments);

// TaskDetailModalComponent usa useNavigate (bottone "Visualizza fattura"):
// richiede un Router anche nei test dove non è owner/il task non è
// fatturato, dato che l'hook è chiamato incondizionatamente al top del
// componente (Rules of Hooks).
function renderModal(ui: ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

const task: TaskWithProject = {
  id: "task-1",
  projectId: "project-1",
  projectName: "Progetto Demo",
  title: "Sistemare il bug di login",
  description: "Il form non valida l'email",
  status: "progress",
  priority: 3,
  dueDate: "2026-09-10",
  assignees: [{ id: "user-1", displayName: "mario" }],
  workStartedAt: null,
  workAccumulatedSeconds: 0,
  workEndedAt: null,
  invoiceId: null,
};

describe("TaskDetailModalComponent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("non renderizza nulla quando isOpen è false", () => {
    mockedListTaskComments.mockResolvedValue([]);
    renderModal(
      <TaskDetailModalComponent isOpen={false} task={task} onClose={() => {}} onGoToTask={() => {}} />,
    );

    expect(screen.queryByRole("dialog", { hidden: true })).not.toBeInTheDocument();
  });

  it("non renderizza nulla quando task è null", () => {
    renderModal(
      <TaskDetailModalComponent isOpen task={null} onClose={() => {}} onGoToTask={() => {}} />,
    );

    expect(screen.queryByRole("dialog", { hidden: true })).not.toBeInTheDocument();
  });

  it("mostra il titolo col nome del progetto e i campi del task come testo statico", () => {
    mockedListTaskComments.mockResolvedValue([]);
    renderModal(
      <TaskDetailModalComponent isOpen task={task} onClose={() => {}} onGoToTask={() => {}} />,
    );

    expect(screen.getByText("Progetto Demo · Dettaglio task")).toBeInTheDocument();
    expect(screen.getByText("Sistemare il bug di login")).toBeInTheDocument();
    expect(screen.getByText("Il form non valida l'email")).toBeInTheDocument();
    expect(screen.getByText("In corso")).toBeInTheDocument();
    expect(screen.getByText("mario")).toBeInTheDocument();
  });

  it("non renderizza alcun input o textarea editabile", () => {
    mockedListTaskComments.mockResolvedValue([]);
    renderModal(
      <TaskDetailModalComponent isOpen task={task} onClose={() => {}} onGoToTask={() => {}} />,
    );

    expect(document.querySelectorAll("input, textarea").length).toBe(0);
    expect(
      screen.queryByPlaceholderText(/Scrivi un commento/i),
    ).not.toBeInTheDocument();
  });

  it("chiama onGoToTask con il task quando si clicca 'Vai al task'", () => {
    mockedListTaskComments.mockResolvedValue([]);
    const onGoToTask = vi.fn();
    renderModal(
      <TaskDetailModalComponent isOpen task={task} onClose={() => {}} onGoToTask={onGoToTask} />,
    );

    screen.getByRole("button", { name: "Vai al task" }).click();

    expect(onGoToTask).toHaveBeenCalledWith(task);
  });

  it("chiama onClose quando si clicca 'Chiudi'", () => {
    mockedListTaskComments.mockResolvedValue([]);
    const onClose = vi.fn();
    renderModal(
      <TaskDetailModalComponent isOpen task={task} onClose={onClose} onGoToTask={() => {}} />,
    );

    // Non getByRole("button", { name: "Chiudi" }): il bottone "×" di
    // ModalBaseComponent ha lo stesso accessible name (aria-label="Chiudi"),
    // getByText distingue il testo visibile del bottone secondario.
    screen.getByText("Chiudi").click();

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
