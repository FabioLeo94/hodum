import { describe, it, expect } from "vitest";
import { getAllProjects, getProjectById } from "./projectService";

describe("projectService", () => {
  it("getAllProjects ritorna i progetti mock", () => {
    const projects = getAllProjects();
    expect(projects.length).toBeGreaterThan(0);
    expect(projects[0].id).toBe("1");
  });

  it("getProjectById trova un progetto esistente", () => {
    const project = getProjectById("1");
    expect(project).toBeDefined();
    expect(project?.name).toBe("Progetto Demo");
  });

  it("getProjectById ritorna undefined per un id inesistente", () => {
    expect(getProjectById("id-inesistente")).toBeUndefined();
  });
});
