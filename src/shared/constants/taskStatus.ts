import { useTranslation } from "react-i18next";
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

// Etichette al plurale: usate per intestazioni di gruppo/colonna (lista,
// Kanban, donut di progetto). Hook (non un Record statico) perché il testo
// dipende dalla lingua corrente: ricalcolato ad ogni render, il valore
// resta comunque stabile finché la lingua non cambia.
export function useStatusGroupLabels(): Record<TaskStatus, string> {
  const { t } = useTranslation();
  return {
    progress: t("shared.taskStatus.group.progress"),
    review: t("shared.taskStatus.group.review"),
    completed: t("shared.taskStatus.group.completed"),
    rejected: t("shared.taskStatus.group.rejected"),
  };
}

// Etichette al singolare, riferite al singolo task selezionato: usate da
// TaskStatusSelectComponent e dalla legenda del Calendario (stessa
// terminologia in entrambi, centralizzata qui per non farla divergere).
export function useStatusLabels(): Record<TaskStatus, string> {
  const { t } = useTranslation();
  return {
    progress: t("shared.taskStatus.label.progress"),
    review: t("shared.taskStatus.label.review"),
    completed: t("shared.taskStatus.label.completed"),
    rejected: t("shared.taskStatus.label.rejected"),
  };
}

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
