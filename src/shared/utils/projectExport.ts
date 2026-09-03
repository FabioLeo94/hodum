import * as XLSX from "xlsx";
import type { Project, Task } from "../types/project";

export type ExportFormat = "json" | "xml" | "csv" | "excel";

const FILE_EXTENSIONS: Record<ExportFormat, string> = {
  json: "json",
  xml: "xml",
  csv: "csv",
  excel: "xlsx",
};

const TASK_COLUMNS: string[] = [
  "ID",
  "Titolo",
  "Descrizione",
  "Stato",
  "Priorità",
  "Scadenza",
  "Assegnatari",
];

function slugifyFileName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "progetto";
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeCsvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function taskToRow(task: Task): string[] {
  return [
    task.id,
    task.title,
    task.description,
    task.status,
    String(task.priority),
    task.dueDate ?? "",
    task.assignees.map((assignee) => assignee.username).join(", "),
  ];
}

function buildJson(project: Project): string {
  return JSON.stringify(project, null, 2);
}

function buildXml(project: Project): string {
  const taskEntries = project.tasks
    .map(
      (task) => `    <task>
      <id>${escapeXml(task.id)}</id>
      <titolo>${escapeXml(task.title)}</titolo>
      <descrizione>${escapeXml(task.description)}</descrizione>
      <stato>${escapeXml(task.status)}</stato>
      <priorita>${task.priority}</priorita>
      <scadenza>${task.dueDate ? escapeXml(task.dueDate) : ""}</scadenza>
      <assegnatari>${task.assignees.map((assignee) => escapeXml(assignee.username)).join(", ")}</assegnatari>
    </task>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<progetto>
  <id>${escapeXml(project.id)}</id>
  <nome>${escapeXml(project.name)}</nome>
  <task>
${taskEntries}
  </task>
</progetto>`;
}

function buildCsv(project: Project): string {
  const rows = [TASK_COLUMNS, ...project.tasks.map(taskToRow)];
  // BOM iniziale: senza, Excel su locale IT interpreta gli accenti UTF-8 come
  // testo malformato invece di aprirli correttamente.
  return "﻿" + rows.map((row) => row.map(escapeCsvField).join(",")).join("\n");
}

function buildExcelBlob(project: Project): Blob {
  const rows = [TASK_COLUMNS, ...project.tasks.map(taskToRow)];
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Task");
  const buffer: ArrayBuffer = XLSX.write(workbook, {
    type: "array",
    bookType: "xlsx",
  });
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function buildBlob(project: Project, format: ExportFormat): Blob {
  switch (format) {
    case "excel":
      return buildExcelBlob(project);
    case "json":
      return new Blob([buildJson(project)], { type: "application/json" });
    case "xml":
      return new Blob([buildXml(project)], { type: "application/xml" });
    case "csv":
      return new Blob([buildCsv(project)], { type: "text/csv;charset=utf-8;" });
  }
}

export function downloadProject(project: Project, format: ExportFormat): void {
  const blob = buildBlob(project, format);
  const fileName = `${slugifyFileName(project.name)}.${FILE_EXTENSIONS[format]}`;

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
