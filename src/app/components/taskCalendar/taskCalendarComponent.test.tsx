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

  it("does not make dots draggable when onDueDateChange is not provided", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 15));
    const task = buildTask({ dueDate: "2026-09-15" });

    render(<TaskCalendarComponent tasks={[task]} onOpenTask={() => {}} />);

    const dot = screen.getByRole("button", { name: "Task di prova" });
    expect(dot).toHaveAttribute("draggable", "false");
  });

  it("moves a task's due date when its dot is dropped on another day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 15));
    const onDueDateChange = vi.fn();
    const task = buildTask({ dueDate: "2026-09-15" });

    render(
      <TaskCalendarComponent
        tasks={[task]}
        onOpenTask={() => {}}
        onDueDateChange={onDueDateChange}
      />,
    );

    const dot = screen.getByRole("button", { name: "Task di prova" });
    const targetCell = screen
      .getAllByText("20")
      .map((el) => el.closest("[data-muted]"))
      .find((el) => el?.getAttribute("data-muted") === "false") as HTMLElement;

    const dataTransfer = { setData: vi.fn(), effectAllowed: "" };
    fireEvent.dragStart(dot, { dataTransfer });
    fireEvent.dragOver(targetCell, { dataTransfer });
    fireEvent.drop(targetCell, { dataTransfer });

    expect(onDueDateChange).toHaveBeenCalledWith(task, "2026-09-20");
  });

  it("does not call onDueDateChange when dropped back on the same day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 15));
    const onDueDateChange = vi.fn();
    const task = buildTask({ dueDate: "2026-09-15" });

    render(
      <TaskCalendarComponent
        tasks={[task]}
        onOpenTask={() => {}}
        onDueDateChange={onDueDateChange}
      />,
    );

    const dot = screen.getByRole("button", { name: "Task di prova" });
    const sameCell = dot.closest("[data-muted]") as HTMLElement;

    const dataTransfer = { setData: vi.fn(), effectAllowed: "" };
    fireEvent.dragStart(dot, { dataTransfer });
    fireEvent.dragOver(sameCell, { dataTransfer });
    fireEvent.drop(sameCell, { dataTransfer });

    expect(onDueDateChange).not.toHaveBeenCalled();
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
