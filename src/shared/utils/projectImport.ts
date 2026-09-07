import type { TaskStatus } from "../types/project";

export interface ImportedTask {
  title: string;
  description: string;
  status: TaskStatus;
  priority: number;
  dueDate: string | null;
}

export interface ParsedProjectImport {
  name: string;
  tasks: ImportedTask[];
}

const VALID_STATUSES: readonly TaskStatus[] = ["progress", "review", "completed", "rejected"];

// Type guard invece di un cast diretto status as TaskStatus: qui il widening
// (TaskStatus[] -> string[]) è sempre sicuro, a differenza del narrowing che
// sostituisce (string -> TaskStatus), e restituisce a parseTask uno status
// già tipizzato senza bisogno di un secondo cast sul valore di ritorno.
function isTaskStatus(value: string): value is TaskStatus {
  return (VALID_STATUSES as readonly string[]).includes(value);
}

function parseTask(value: unknown): ImportedTask | null {
  if (typeof value !== "object" || value === null) return null;
  const { title, description, status, priority, dueDate } = value as Record<string, unknown>;
  if (typeof title !== "string" || title.trim() === "") return null;
  if (typeof status !== "string" || !isTaskStatus(status)) return null;

  return {
    title,
    description: typeof description === "string" ? description : "",
    status,
    priority: typeof priority === "number" ? priority : 5,
    dueDate: typeof dueDate === "string" ? dueDate : null,
  };
}

// Valida la struttura di un file importato contro lo schema prodotto da
// downloadProject in formato "json" (l'unico lossless, vedi projectExport.ts):
// null se non corrisponde, così il chiamante mostra un unico messaggio
// d'errore invece di propagare eccezioni di parsing sparse (stesso principio
// di validatePassword/validateEmail in validationService.ts, che restituiscono
// un esito invece di lanciare).
export function parseProjectExport(value: unknown): ParsedProjectImport | null {
  if (typeof value !== "object" || value === null) return null;
  const { name, tasks } = value as Record<string, unknown>;
  if (typeof name !== "string" || name.trim() === "") return null;
  if (!Array.isArray(tasks)) return null;

  const parsedTasks: ImportedTask[] = [];
  for (const task of tasks) {
    const parsed = parseTask(task);
    if (!parsed) return null;
    parsedTasks.push(parsed);
  }

  return { name: name.trim(), tasks: parsedTasks };
}
