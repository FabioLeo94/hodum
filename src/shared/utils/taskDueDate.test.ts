import { describe, it, expect } from "vitest";
import type { Task } from "../types/project";
import { DUE_SOON_THRESHOLD_DAYS, isTaskDueSoon, isTaskOverdue } from "./taskDueDate";

const TODAY = new Date(2026, 8, 2); // 2 settembre 2026

function buildTask(overrides: Partial<Task>): Task {
  return {
    id: "task-1",
    title: "Task di prova",
    description: "",
    status: "progress",
    priority: 5,
    dueDate: null,
    ...overrides,
  };
}

describe("taskDueDate", () => {
  it("non è mai in scadenza né in ritardo quando dueDate è null", () => {
    const task = buildTask({ dueDate: null });
    expect(isTaskOverdue(task, TODAY)).toBe(false);
    expect(isTaskDueSoon(task, TODAY)).toBe(false);
  });

  it("non è mai in scadenza né in ritardo quando il task è completato, anche con una dueDate passata", () => {
    const task = buildTask({ dueDate: "2026-08-01", status: "completed" });
    expect(isTaskOverdue(task, TODAY)).toBe(false);
    expect(isTaskDueSoon(task, TODAY)).toBe(false);
  });

  it("non è mai in scadenza né in ritardo quando il task è rifiutato, anche con una dueDate passata", () => {
    const task = buildTask({ dueDate: "2026-08-01", status: "rejected" });
    expect(isTaskOverdue(task, TODAY)).toBe(false);
    expect(isTaskDueSoon(task, TODAY)).toBe(false);
  });

  it("è in scadenza (non in ritardo) quando dueDate è oggi", () => {
    const task = buildTask({ dueDate: "2026-09-02" });
    expect(isTaskDueSoon(task, TODAY)).toBe(true);
    expect(isTaskOverdue(task, TODAY)).toBe(false);
  });

  it("è ancora in scadenza esattamente alla soglia (boundary incluso)", () => {
    const task = buildTask({ dueDate: "2026-09-09" }); // TODAY + 7 giorni
    expect(isTaskDueSoon(task, TODAY)).toBe(true);
    expect(isTaskOverdue(task, TODAY)).toBe(false);
  });

  it("non è più in scadenza un giorno oltre la soglia", () => {
    const task = buildTask({ dueDate: "2026-09-10" }); // TODAY + 8 giorni
    expect(isTaskDueSoon(task, TODAY)).toBe(false);
    expect(isTaskOverdue(task, TODAY)).toBe(false);
  });

  it("è in ritardo (non in scadenza) quando dueDate è ieri", () => {
    const task = buildTask({ dueDate: "2026-09-01" });
    expect(isTaskOverdue(task, TODAY)).toBe(true);
    expect(isTaskDueSoon(task, TODAY)).toBe(false);
  });

  it("espone la soglia usata come 7 giorni", () => {
    expect(DUE_SOON_THRESHOLD_DAYS).toBe(7);
  });
});
