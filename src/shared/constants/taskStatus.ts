import type { TaskStatus } from "../types/project";

// Ordine di visualizzazione condiviso tra vista lista e vista Kanban: le
// colonne/gruppi seguono sempre questa sequenza, indipendentemente
// dall'ordine con cui i task arrivano dal backend.
export const STATUS_ORDER = [
  "progress",
  "review",
  "completed",
  "rejected",
] as const satisfies readonly TaskStatus[];

// Etichette al plurale: usate per intestazioni di gruppo/colonna (lista e
// Kanban). TaskStatusSelectComponent ha le proprie etichette al singolare,
// riferite al singolo task selezionato, quindi non sono unificate con queste.
export const STATUS_GROUP_LABELS: Record<TaskStatus, string> = {
  progress: "In corso",
  review: "In review",
  completed: "Completati",
  rejected: "Rifiutati",
};

export function groupTasksByStatus<T extends { status: TaskStatus }>(
  tasks: readonly T[],
): Record<TaskStatus, T[]> {
  const groups: Record<TaskStatus, T[]> = {
    progress: [],
    review: [],
    completed: [],
    rejected: [],
  };
  for (const task of tasks) {
    groups[task.status].push(task);
  }
  return groups;
}
