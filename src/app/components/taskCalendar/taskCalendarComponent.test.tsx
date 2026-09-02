import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Task } from "../../../shared/types/project";
import TaskCalendarComponent from "./taskCalendarComponent";

function buildTask(overrides: Partial<Task>): Task {
  return {
    id: "task-1",
    title: "Task di prova",
    description: "",
    status: "progress",
    priority: 5,
    dueDate: null,
    assignees: [],
    ...overrides,
  };
}

describe("TaskCalendarComponent", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the current month and year in the header", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 15));

    render(<TaskCalendarComponent tasks={[]} onOpenTask={() => {}} />);

    expect(screen.getByText("Settembre 2026")).toBeInTheDocument();
  });

  it("renders a dot for a task due today and calls onOpenTask when clicked", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 15));
    const onOpenTask = vi.fn();
    const task = buildTask({ dueDate: "2026-09-15" });

    render(<TaskCalendarComponent tasks={[task]} onOpenTask={onOpenTask} />);

    const dot = screen.getByRole("button", { name: "Task di prova" });
    fireEvent.click(dot);

    expect(onOpenTask).toHaveBeenCalledWith(task);
  });

  it("does not render a dot for a task without a due date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 15));
    const task = buildTask({ dueDate: null, title: "Task senza scadenza" });

    render(<TaskCalendarComponent tasks={[task]} onOpenTask={() => {}} />);

    expect(
      screen.queryByRole("button", { name: "Task senza scadenza" }),
    ).not.toBeInTheDocument();
  });

  it("moves to the next/previous month and back to today via the nav buttons", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 15));

    render(<TaskCalendarComponent tasks={[]} onOpenTask={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Mese successivo" }));
    expect(screen.getByText("Ottobre 2026")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Mese precedente" }));
    fireEvent.click(screen.getByRole("button", { name: "Mese precedente" }));
    expect(screen.getByText("Agosto 2026")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Oggi"));
    expect(screen.getByText("Settembre 2026")).toBeInTheDocument();
  });
});
