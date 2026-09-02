import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import ProjectComponent from "./projectComponent";
import type { Project } from "../../../shared/types/project";

const mockProject: Project = {
  id: "1",
  name: "Progetto Demo",
  tasks: [
    { id: "t1", title: "Task 1", description: "desc 1", status: "completed", priority: 5, dueDate: null, assignees: [] },
    { id: "t2", title: "Task 2", description: "desc 2", status: "completed", priority: 5, dueDate: null, assignees: [] },
    { id: "t3", title: "Task 3", description: "desc 3", status: "progress", priority: 5, dueDate: null, assignees: [] },
    { id: "t4", title: "Task 4", description: "desc 4", status: "progress", priority: 5, dueDate: null, assignees: [] },
    { id: "t5", title: "Task 5", description: "desc 5", status: "review", priority: 5, dueDate: null, assignees: [] },
    { id: "t6", title: "Task 6", description: "desc 6", status: "review", priority: 5, dueDate: null, assignees: [] },
  ],
};

function renderProject(canManage = true) {
  return render(
    <MemoryRouter>
      <ProjectComponent
        {...mockProject}
        canManage={canManage}
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

  it("hides rename/delete/kebab actions when canManage is false", () => {
    renderProject(false);
    expect(
      screen.queryByRole("button", { name: "Rinomina progetto Progetto Demo" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Elimina progetto Progetto Demo" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Altre azioni per Progetto Demo" }),
    ).not.toBeInTheDocument();
  });
});
