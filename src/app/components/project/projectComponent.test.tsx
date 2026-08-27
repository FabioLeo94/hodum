import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ProjectComponent from "./projectComponent";
import type { Project } from "../../../shared/types/project";

const mockNavigate = vi.hoisted(() => vi.fn());
vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockProject: Project = {
  id: "1",
  name: "Progetto Demo",
  tasks: [
    { title: "Task 1", description: "desc 1", status: "completed", tags: [] },
    { title: "Task 2", description: "desc 2", status: "completed", tags: [] },
    { title: "Task 3", description: "desc 3", status: "progress", tags: [] },
    { title: "Task 4", description: "desc 4", status: "progress", tags: [] },
    { title: "Task 5", description: "desc 5", status: "review", tags: [] },
    { title: "Task 6", description: "desc 6", status: "review", tags: [] },
  ],
};

describe("ProjectComponent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mockNavigate.mockReset();
  });

  it("renders name and task counts", () => {
    render(<ProjectComponent {...mockProject} />);
    expect(screen.getByText("Progetto Demo")).toBeInTheDocument();
    expect(screen.getByText("Completati: 2")).toBeInTheDocument();
    expect(screen.getByText("In corso: 2")).toBeInTheDocument();
    expect(screen.getByText("In review: 2")).toBeInTheDocument();
  });

  it("is not rendered as a button", () => {
    render(<ProjectComponent {...mockProject} />);
    expect(screen.queryByRole("button", { name: /progetto demo/i })).toBeInTheDocument();
    expect(document.querySelector("button")).not.toBeInTheDocument();
  });

  it("naviga alla task-list del progetto al click", () => {
    render(<ProjectComponent {...mockProject} />);
    fireEvent.click(screen.getByRole("button"));
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith("/dashboard/1/task-list");
  });

  it("ignora i click successivi al primo (doppio click)", () => {
    render(<ProjectComponent {...mockProject} />);
    const card = screen.getByRole("button");
    fireEvent.click(card);
    fireEvent.click(card);
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });

  it("activates on Enter key press", () => {
    render(<ProjectComponent {...mockProject} />);
    fireEvent.keyDown(screen.getByRole("button"), { key: "Enter" });
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith("/dashboard/1/task-list");
  });
});
