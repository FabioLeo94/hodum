import type { TFunction } from "i18next";
import type { Task } from "../types/project";

// Soglia unica per "in scadenza": mai ricopiata altrove (es. nel componente
// Calendario), così un cambio di policy resta un tocco solo qui.
export const DUE_SOON_THRESHOLD_DAYS = 7;

// Simmetrico a formatDateOnly lato backend (taskService.ts): `new Date("YYYY-MM-DD")`
// nativo interpreta la stringa come UTC mezzanotte, che può slittare al
// giorno prima/dopo una volta convertito in ora locale. Qui si costruisce
// invece la Date direttamente in ora locale.
// Esportata anche per chi deve solo formattare una dueDate per la UI (es.
// TaskDetailModalComponent) senza calcolare overdue/dueSoon: stessa esigenza
// di evitare `new Date(iso)` su una data pura, vedi il commento sopra.
export function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

// Inverso di parseDateOnly: usata anche fuori da questo modulo (vedi
// taskCalendarComponent.tsx) per ottenere la stessa chiave "YYYY-MM-DD" con
// cui confrontare task.dueDate, sia per una Date locale qualunque sia per
// "oggi". Mai toISOString() (converte a UTC, può far slittare il giorno).
export function formatDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// Differenza in giorni interi tra due date, calcolata a mezzanotte locale su
// entrambi i lati: un confronto sui timestamp esatti farebbe dipendere il
// risultato dall'ora del giorno in cui viene chiamata la funzione.
function diffInDays(from: Date, to: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / msPerDay);
}

// Un task già completato/rifiutato non è mai "in ritardo" o "in scadenza":
// segnalarlo sarebbe fuorviante, la scadenza non è più un rischio per un
// task che non è più in corso.
function isOpenTaskWithDueDate(task: Task): task is Task & { dueDate: string } {
  return task.dueDate !== null && task.status !== "completed" && task.status !== "rejected";
}

// Mutuamente esclusiva con isTaskDueSoon per costruzione (qui diff < 0, là
// diff tra 0 e la soglia inclusi): il chiamante può quindi usare if/else if
// senza sovrapposizioni.
export function isTaskOverdue(task: Task, today: Date = new Date()): boolean {
  if (!isOpenTaskWithDueDate(task)) return false;
  return diffInDays(today, parseDateOnly(task.dueDate)) < 0;
}

export function isTaskDueSoon(task: Task, today: Date = new Date()): boolean {
  if (!isOpenTaskWithDueDate(task)) return false;
  const diff = diffInDays(today, parseDateOnly(task.dueDate));
  return diff >= 0 && diff <= DUE_SOON_THRESHOLD_DAYS;
}

export interface DueUrgency {
  level: "overdue" | "dueSoon";
  label: string;
}

// Etichetta leggibile della distanza dalla scadenza, usata da Lista e Kanban
// (il Calendario non ne ha bisogno: la cella del giorno è già la scadenza,
// vedi isTaskOverdue/isTaskDueSoon sopra). Un solo attraversamento invece di
// richiamare isTaskOverdue + isTaskDueSoon dal chiamante: qui il calcolo del
// diff è unico e la label deriva direttamente dallo stesso valore. `t` è
// passato dal chiamante (non un useTranslation qui dentro): è una funzione
// pura, non un componente/hook, quindi non può leggere il contesto i18n da sé.
export function getDueUrgency(task: Task, t: TFunction, today: Date = new Date()): DueUrgency | null {
  if (!isOpenTaskWithDueDate(task)) return null;
  const diff = diffInDays(today, parseDateOnly(task.dueDate));
  if (diff < 0) {
    return {
      level: "overdue",
      label: t("shared.dueUrgency.overdue", { count: -diff }),
    };
  }
  if (diff > DUE_SOON_THRESHOLD_DAYS) return null;
  return {
    level: "dueSoon",
    label: diff === 0 ? t("shared.dueUrgency.dueToday") : t("shared.dueUrgency.dueSoon", { count: diff }),
  };
}
