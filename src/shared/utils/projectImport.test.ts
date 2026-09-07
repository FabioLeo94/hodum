import { describe, it, expect } from "vitest";
import { parseProjectExport } from "./projectImport";
import type { Project } from "../types/project";

const project: Project = {
  id: "p1",
  name: "Progetto Alpha!",
  customerId: null,
  tasks: [
    {
      id: "t1",
      title: "Task uno",
      description: "desc, con virgola",
      status: "progress",
      priority: 3,
      dueDate: "2026-01-01",
      assignees: [{ id: "u1", displayName: "mario" }],
      workStartedAt: null,
      workAccumulatedSeconds: 0,
      workEndedAt: null,
      invoiceId: null,
    },
  ],
};

describe("parseProjectExport", () => {
  it("parses the JSON export produced by downloadProject", () => {
    const result = parseProjectExport(JSON.parse(JSON.stringify(project)));
    expect(result).toEqual({
      name: "Progetto Alpha!",
      tasks: [
        {
          title: "Task uno",
          description: "desc, con virgola",
          status: "progress",
          priority: 3,
          dueDate: "2026-01-01",
        },
      ],
    });
  });

  it("defaults description/priority/dueDate when a task omits them", () => {
    const result = parseProjectExport({
      name: "Progetto minimo",
      tasks: [{ title: "Solo titolo", status: "review" }],
    });
    expect(result).toEqual({
      name: "Progetto minimo",
      tasks: [
        { title: "Solo titolo", description: "", status: "review", priority: 5, dueDate: null },
      ],
    });
  });

  it("trims a padded project name", () => {
    const result = parseProjectExport({ name: "  Con spazi  ", tasks: [] });
    expect(result?.name).toBe("Con spazi");
  });

  it.each([
    ["non-object input", "not an object"],
    ["null", null],
    ["missing name", { tasks: [] }],
    ["blank name", { name: "   ", tasks: [] }],
    ["missing tasks array", { name: "Progetto" }],
    ["tasks not an array", { name: "Progetto", tasks: "nope" }],
    ["a task without a title", { name: "Progetto", tasks: [{ status: "progress" }] }],
    [
      "a task with an unknown status",
      { name: "Progetto", tasks: [{ title: "T", status: "archived" }] },
    ],
  ])("returns null for %s", (_label, input) => {
    expect(parseProjectExport(input)).toBeNull();
  });
});
