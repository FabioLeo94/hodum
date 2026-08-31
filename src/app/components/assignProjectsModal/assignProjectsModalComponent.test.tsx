import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AssignProjectsModalComponent from "./assignProjectsModalComponent";
import { listProjectsSummary } from "../../services/project/projectService";
import { getAssignedProjectIds } from "../../services/user/userService";

vi.mock("../../services/project/projectService", () => ({
  listProjectsSummary: vi.fn(),
}));
vi.mock("../../services/user/userService", () => ({
  getAssignedProjectIds: vi.fn(),
}));

const mockedListProjectsSummary = vi.mocked(listProjectsSummary);
const mockedGetAssignedProjectIds = vi.mocked(getAssignedProjectIds);

describe("AssignProjectsModalComponent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a loading status while fetching projects and assignments", () => {
    mockedListProjectsSummary.mockReturnValue(new Promise(() => {}));
    mockedGetAssignedProjectIds.mockReturnValue(new Promise(() => {}));

    render(
      <AssignProjectsModalComponent
        isOpen
        onClose={() => {}}
        employeeId="u1"
        employeeUsername="dipendente1"
        onSave={() => {}}
      />,
    );

    expect(screen.getByText("Caricamento dei progetti...")).toBeInTheDocument();
  });

  it("renders the project checklist pre-checked with the current assignments", async () => {
    mockedListProjectsSummary.mockResolvedValue([
      { id: "p1", name: "Sito e-commerce" },
      { id: "p2", name: "App interna" },
    ]);
    mockedGetAssignedProjectIds.mockResolvedValue(["p1"]);

    render(
      <AssignProjectsModalComponent
        isOpen
        onClose={() => {}}
        employeeId="u1"
        employeeUsername="dipendente1"
        onSave={() => {}}
      />,
    );

    const checkbox1 = await screen.findByRole("checkbox", { name: "Sito e-commerce" });
    const checkbox2 = screen.getByRole("checkbox", { name: "App interna" });
    expect(checkbox1).toBeChecked();
    expect(checkbox2).not.toBeChecked();
  });

  it("calls onSave with the toggled selection", async () => {
    mockedListProjectsSummary.mockResolvedValue([
      { id: "p1", name: "Sito e-commerce" },
      { id: "p2", name: "App interna" },
    ]);
    mockedGetAssignedProjectIds.mockResolvedValue(["p1"]);
    const onSave = vi.fn();

    render(
      <AssignProjectsModalComponent
        isOpen
        onClose={() => {}}
        employeeId="u1"
        employeeUsername="dipendente1"
        onSave={onSave}
      />,
    );

    const checkbox2 = await screen.findByRole("checkbox", { name: "App interna" });
    fireEvent.click(checkbox2);
    fireEvent.click(screen.getByText("Salva"));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith(["p1", "p2"]);
  });

  it("shows the load error instead of the checklist when fetching fails", async () => {
    mockedListProjectsSummary.mockRejectedValue(new Error("Impossibile caricare i progetti."));
    mockedGetAssignedProjectIds.mockResolvedValue([]);

    render(
      <AssignProjectsModalComponent
        isOpen
        onClose={() => {}}
        employeeId="u1"
        employeeUsername="dipendente1"
        onSave={() => {}}
      />,
    );

    expect(
      await screen.findByText("Impossibile caricare i progetti."),
    ).toBeInTheDocument();
  });

  it("displays the submitError passed from the parent", async () => {
    mockedListProjectsSummary.mockResolvedValue([]);
    mockedGetAssignedProjectIds.mockResolvedValue([]);

    render(
      <AssignProjectsModalComponent
        isOpen
        onClose={() => {}}
        employeeId="u1"
        employeeUsername="dipendente1"
        onSave={() => {}}
        submitError="Impossibile aggiornare i progetti assegnati."
      />,
    );

    expect(
      await screen.findByText("Impossibile aggiornare i progetti assegnati."),
    ).toBeInTheDocument();
  });

  it("calls onClose when the cancel button is clicked", async () => {
    mockedListProjectsSummary.mockResolvedValue([]);
    mockedGetAssignedProjectIds.mockResolvedValue([]);
    const onClose = vi.fn();

    render(
      <AssignProjectsModalComponent
        isOpen
        onClose={onClose}
        employeeId="u1"
        employeeUsername="dipendente1"
        onSave={() => {}}
      />,
    );

    fireEvent.click(screen.getByText("Annulla"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
