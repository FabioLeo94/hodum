import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import ProjectComponent from "./projectComponent";
import type { Project } from "../../../shared/types/project";

const mockProject: Project = {
  id: "1",
  name: "Progetto Demo",
  tasks: [
    { id: "t1", title: "Task 1", description: "desc 1", status: "completed" },
    { id: "t2", title: "Task 2", description: "desc 2", status: "completed" },
    { id: "t3", title: "Task 3", description: "desc 3", status: "progress" },
    { id: "t4", title: "Task 4", description: "desc 4", status: "progress" },
    { id: "t5", title: "Task 5", description: "desc 5", status: "review" },
    { id: "t6", title: "Task 6", description: "desc 6", status: "review" },
  ],
};

function renderProject() {
  return render(
    <MemoryRouter>
      <ProjectComponent
        {...mockProject}
        onRenameProject={vi.fn()}
        onDeleteProject={vi.fn()}
      />
    </MemoryRouter>,
  );
}

describe("ProjectComponent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders name and task counts, with an accessible summary on the card link", () => {
    renderProject();
    expect(screen.getByText("Progetto Demo")).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "Progetto Demo, 6 task: 2 completati, 2 in corso, 2 in review",
      }),
    ).toBeInTheDocument();
  });

  it("links to the project's task-list route", () => {
    renderProject();
    expect(
      screen.getByRole("link", { name: /progetto demo/i }),
    ).toHaveAttribute("href", "/dashboard/1/task-list");
  });

  it("exposes rename and delete actions as accessible buttons, not nested inside the link", () => {
    renderProject();
    expect(
      screen.getByRole("button", { name: "Rinomina progetto Progetto Demo" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Elimina progetto Progetto Demo" }),
    ).toBeInTheDocument();
  });
});
