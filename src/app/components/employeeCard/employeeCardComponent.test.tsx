import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import EmployeeCardComponent from "./employeeCardComponent";
import type { User } from "../../services/auth/authService";
import { listProjectsSummary } from "../../services/project/projectService";
import { getAssignedProjectIds, setAssignedProjects } from "../../services/user/userService";

vi.mock("../../services/project/projectService", () => ({
  listProjectsSummary: vi.fn(),
}));
vi.mock("../../services/user/userService", () => ({
  getAssignedProjectIds: vi.fn(),
  setAssignedProjects: vi.fn(),
}));

const mockedListProjectsSummary = vi.mocked(listProjectsSummary);
const mockedGetAssignedProjectIds = vi.mocked(getAssignedProjectIds);
const mockedSetAssignedProjects = vi.mocked(setAssignedProjects);

const mockEmployee: User = {
  id: "u1",
  username: "dipendente1",
  firstName: "Mario",
  lastName: "Rossi",
  pronoun: null,
  email: "mario.rossi@example.com",
  companyId: "c1",
  role: "employee",
  mustChangePassword: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  lastLoginAt: null,
  disabledAt: null,
};

function renderCard(overrides: Partial<React.ComponentProps<typeof EmployeeCardComponent>> = {}) {
  return render(
    <ul>
      <EmployeeCardComponent
        employee={mockEmployee}
        canManageEmployees={false}
        canAssignProjects
        onEdit={vi.fn()}
        onToggleDisable={vi.fn()}
        onDelete={vi.fn()}
        {...overrides}
      />
    </ul>,
  );
}

function openKebabMenu() {
  fireEvent.click(screen.getByRole("button", { name: "Altre azioni per dipendente1" }));
}

describe("EmployeeCardComponent - assegnazione progetti", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("mostra la checklist progetti pre-selezionata quando si apre il sub-pannello", async () => {
    mockedListProjectsSummary.mockResolvedValue([
      { id: "p1", name: "Sito e-commerce" },
      { id: "p2", name: "App interna" },
    ]);
    mockedGetAssignedProjectIds.mockResolvedValue(["p1"]);

    renderCard();
    openKebabMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Assegna progetti" }));

    const checkbox1 = await screen.findByRole("checkbox", { name: "Sito e-commerce" });
    const checkbox2 = screen.getByRole("checkbox", { name: "App interna" });
    expect(checkbox1).toBeChecked();
    expect(checkbox2).not.toBeChecked();
  });

  it("invia un'unica chiamata con la selezione aggiornata quando si torna al menu", async () => {
    mockedListProjectsSummary.mockResolvedValue([
      { id: "p1", name: "Sito e-commerce" },
      { id: "p2", name: "App interna" },
    ]);
    mockedGetAssignedProjectIds.mockResolvedValue(["p1"]);
    mockedSetAssignedProjects.mockResolvedValue(undefined);

    renderCard();
    openKebabMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Assegna progetti" }));

    const checkbox2 = await screen.findByRole("checkbox", { name: "App interna" });
    fireEvent.click(checkbox2);

    expect(mockedSetAssignedProjects).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Torna al menu" }));

    await waitFor(() => expect(mockedSetAssignedProjects).toHaveBeenCalledTimes(1));
    expect(mockedSetAssignedProjects).toHaveBeenCalledWith("u1", ["p1", "p2"]);
  });

  it("non invia nulla se si torna al menu senza aver modificato la selezione", async () => {
    mockedListProjectsSummary.mockResolvedValue([
      { id: "p1", name: "Sito e-commerce" },
      { id: "p2", name: "App interna" },
    ]);
    mockedGetAssignedProjectIds.mockResolvedValue(["p1"]);

    renderCard();
    openKebabMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Assegna progetti" }));

    await screen.findByRole("checkbox", { name: "Sito e-commerce" });

    fireEvent.click(screen.getByRole("button", { name: "Torna al menu" }));

    expect(mockedSetAssignedProjects).not.toHaveBeenCalled();
  });

  it("non salva nulla se il caricamento dei progetti fallisce", async () => {
    mockedListProjectsSummary.mockRejectedValue(new Error("Impossibile caricare i progetti."));
    mockedGetAssignedProjectIds.mockResolvedValue([]);

    renderCard();
    openKebabMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Assegna progetti" }));

    expect(
      await screen.findByText("Impossibile caricare i progetti."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Torna al menu" }));

    expect(mockedSetAssignedProjects).not.toHaveBeenCalled();
  });

  it("non mostra la voce assegna progetti per un project manager", () => {
    renderCard({ canManageEmployees: true, employee: { ...mockEmployee, role: "manager" } });
    openKebabMenu();
    expect(screen.queryByRole("menuitem", { name: "Assegna progetti" })).not.toBeInTheDocument();
  });
});
