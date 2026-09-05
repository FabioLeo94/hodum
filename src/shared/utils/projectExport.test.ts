import { describe, it, expect, vi, afterEach } from "vitest";
import { downloadProject } from "./projectExport";
import type { Project } from "../types/project";

const project: Project = {
  id: "p1",
  name: "Progetto Alpha!",
  tasks: [
    {
      id: "t1",
      title: "Task uno",
      description: "desc, con virgola",
      status: "progress",
      priority: 3,
      dueDate: "2026-01-01",
      assignees: [{ id: "u1", username: "mario" }],
      workStartedAt: null,
      workAccumulatedSeconds: 0,
      workEndedAt: null,
    },
  ],
};

function captureDownload() {
  let capturedBlob: Blob | null = null;
  let capturedFileName = "";

  vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
    capturedBlob = blob as Blob;
    return "blob:mock";
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
    function (this: HTMLAnchorElement) {
      capturedFileName = this.download;
    },
  );

  return {
    getBlob: () => capturedBlob,
    getFileName: () => capturedFileName,
  };
}

describe("downloadProject", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("names the file after a slugified project name", () => {
    const capture = captureDownload();
    downloadProject(project, "json");
    expect(capture.getFileName()).toBe("progetto-alpha.json");
  });

  it("serializes the project as JSON", async () => {
    const capture = captureDownload();
    downloadProject(project, "json");
    const text = await capture.getBlob()!.text();
    expect(JSON.parse(text)).toEqual(project);
  });

  it("escapes commas in CSV fields and includes the assignee username", async () => {
    const capture = captureDownload();
    downloadProject(project, "csv");
    const text = await capture.getBlob()!.text();
    expect(text).toContain('"desc, con virgola"');
    expect(text).toContain("mario");
  });

  it("produces well-formed XML with the task fields", async () => {
    const capture = captureDownload();
    downloadProject(project, "xml");
    const text = await capture.getBlob()!.text();
    expect(text).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(text).toContain("<titolo>Task uno</titolo>");
    expect(text).toContain("<assegnatari>mario</assegnatari>");
  });

  it("produces an .xlsx workbook blob", () => {
    const capture = captureDownload();
    downloadProject(project, "excel");
    expect(capture.getBlob()?.type).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(capture.getFileName()).toBe("progetto-alpha.xlsx");
  });
});
