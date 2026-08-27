import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ProjectComponent from "./projectComponent";

const mockProject = {
  id: "1",
  name: "Progetto Demo",
  completedTasks: 2,
  inProgressTasks: 2,
  reviewTasks: 2,
};

describe("ProjectComponent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
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

  it("logs a debug message on click without navigating", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    render(<ProjectComponent {...mockProject} />);
    fireEvent.click(screen.getByRole("button"));
    expect(debugSpy).toHaveBeenCalledTimes(1);
    expect(debugSpy).toHaveBeenCalledWith(
      expect.stringContaining("Progetto Demo"),
    );
  });

  it("activates on Enter key press", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    render(<ProjectComponent {...mockProject} />);
    fireEvent.keyDown(screen.getByRole("button"), { key: "Enter" });
    expect(debugSpy).toHaveBeenCalledTimes(1);
  });
});
