import { Fragment, useState } from "react";
import type { DragEvent } from "react";
import { useTranslation } from "react-i18next";
import type { Task, TaskStatus } from "../../../shared/types/project";
import { formatDateOnly, isTaskDueSoon, isTaskOverdue } from "../../../shared/utils/taskDueDate";
import { resolveDateLocale } from "../../../shared/utils/formatDate";
import { useStatusLabels } from "../../../shared/constants/taskStatus";
import styles from "./taskCalendarComponent.module.css";

// Il formatter va ricostruito a ogni chiamata (non un const di modulo): deve
// seguire la lingua i18next corrente, che può cambiare a runtime tramite il
// selettore lingua. Intl.DateTimeFormat restituisce il mese minuscolo in
// italiano ("settembre 2026"): capitalizzato qui invece che a livello di
// formatter, che non ha un'opzione per farlo.
function formatMonthYear(date: Date): string {
  const raw = new Intl.DateTimeFormat(resolveDateLocale(), {
    month: "long",
    year: "numeric",
  }).format(date);
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

interface CalendarCell {
  date: Date;
  dateKey: string;
  isCurrentMonth: boolean;
}

// Griglia di settimane intere (7 celle ciascuna), incluse le code dei mesi
// adiacenti che completano la prima e l'ultima riga: un calendario mensile
// mostra sempre settimane complete, mai giorni isolati a inizio/fine riga.
function buildMonthGrid(viewedMonth: Date): CalendarCell[][] {
  const year = viewedMonth.getFullYear();
  const month = viewedMonth.getMonth();

  // Converte la convenzione JS (0=Domenica..6=Sabato) in Lunedì=0..Domenica=6,
  // richiesta dall'intestazione "Lun..Dom".
  const firstWeekdayOffset = (new Date(year, month, 1).getDay() + 6) % 7;
  // Giorno 0 del mese successivo = ultimo giorno del mese corrente.
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((firstWeekdayOffset + daysInMonth) / 7) * 7;
  const gridStart = new Date(year, month, 1 - firstWeekdayOffset);

  const cells: CalendarCell[] = [];
  for (let i = 0; i < totalCells; i++) {
    const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    cells.push({
      date,
      dateKey: formatDateOnly(date),
      isCurrentMonth: date.getMonth() === month && date.getFullYear() === year,
    });
  }

  const weeks: CalendarCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

// Una sola passata sui task (non per-cella): ogni cella guarda poi solo la
// lista associata alla propria data formattata.
function groupTasksByDueDate(tasks: Task[]): Map<string, Task[]> {
  const map = new Map<string, Task[]>();
  for (const task of tasks) {
    if (!task.dueDate) continue;
    const existing = map.get(task.dueDate);
    if (existing) {
      existing.push(task);
    } else {
      map.set(task.dueDate, [task]);
    }
  }
  return map;
}

const STATUS_DOT_STYLES: Record<TaskStatus, string> = {
  progress: styles.dotProgress,
  review: styles.dotReview,
  completed: styles.dotCompleted,
  rejected: styles.dotRejected,
};

const LEGEND_STATUSES: TaskStatus[] = ["progress", "review", "completed", "rejected"];

// Oltre questa soglia i pallini di un giorno vengono troncati con un chip
// "+N" espandibile: una cella con 10+ task non deve poter dilatare l'intera
// riga della griglia (le altre celle della stessa riga si stirano alla sua
// altezza in un layout a grid), quindi si limita la crescita di default e la
// si rende opt-in giorno per giorno.
const DOT_VISIBLE_LIMIT = 6;

interface TaskCalendarComponentProps {
  tasks: Task[];
  onOpenTask: (task: Task) => void;
  /** Id dei task che NON corrispondono a un filtro attivo altrove (ricerca
   * testo/stato/priorità/assegnatario nella pagina task, vedi taskList.tsx).
   * A differenza di Lista/Kanban, dove i filtri nascondono le righe/card che
   * non corrispondono, qui i dot restano tutti al proprio posto: nascondere
   * eventi lascerebbe celle vuote indistinguibili da giorni davvero senza
   * task, rompendo la leggibilità della griglia mensile. I task filtrati
   * vengono invece attenuati (stesso trattamento di opacità dei giorni fuori
   * mese, vedi .dayCell[data-muted]), restando comunque cliccabili. Opzionale
   * e senza default "computato": il chiamante decide se e quando passarlo,
   * la logica di matching vera e propria non vive qui. */
  dimmedTaskIds?: Set<string>;
  /** Trascinare un dot su un altro giorno ne sposta la scadenza a quel
   * giorno. Opzionale: quando assente i dot restano statici (nessun
   * draggable) invece di offrire un'interazione che non avrebbe effetto —
   * il chiamante decide se e come persistere il cambio (endpoint diverso in
   * taskList.tsx, che conosce già il progetto, rispetto alla vista aggregata
   * della dashboard, che deve risalire al progetto del task). */
  onDueDateChange?: (task: Task, newDueDate: string) => void;
}

// Vista Calendario dei task con scadenza: nessun task senza dueDate compare
// qui (a differenza di Lista/Kanban), quindi riceve l'elenco piatto dei task
// del progetto, non raggruppato per stato.
function TaskCalendarComponent({
  tasks,
  onOpenTask,
  dimmedTaskIds,
  onDueDateChange,
}: TaskCalendarComponentProps) {
  const { t } = useTranslation();
  const STATUS_LABELS = useStatusLabels();
  const WEEKDAY_LABELS = t("components.taskCalendar.weekdays", { returnObjects: true }) as string[];
  const [viewedMonth, setViewedMonth] = useState(() => startOfMonth(new Date()));
  // Giorni con la lista task espansa oltre DOT_VISIBLE_LIMIT, opt-in per
  // singola cella: non si resetta al cambio mese, ma le dateKey sono
  // univoche a livello globale (AAAA-MM-GG) quindi non c'è collisione.
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  // Task attualmente trascinato, catturato al dragstart (stesso motivo del
  // draggedTaskStatus in TaskKanbanBoardComponent): serve sia a sapere quale
  // task spostare al drop, sia a confrontare la sua dueDate originale con la
  // cella di destinazione per non generare un update no-op quando si rilascia
  // sullo stesso giorno da cui si è partiti.
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [dragOverDateKey, setDragOverDateKey] = useState<string | null>(null);

  function handleDotDragStart(event: DragEvent<HTMLButtonElement>, task: Task) {
    event.dataTransfer.effectAllowed = "move";
    // dataTransfer non è letto al drop (il task trascinato è già in stato
    // locale, più comodo perché è l'oggetto Task completo e non solo l'id):
    // il setData resta comunque necessario perché Firefox richiede almeno
    // un dato impostato per avviare il drag nativo.
    event.dataTransfer.setData("text/plain", task.id);
    setDraggedTask(task);
  }

  function handleDotDragEnd() {
    setDraggedTask(null);
    setDragOverDateKey(null);
  }

  function handleDayDragOver(event: DragEvent<HTMLDivElement>, dateKey: string) {
    if (!draggedTask) return;
    event.preventDefault();
    setDragOverDateKey(dateKey);
  }

  function handleDayDragLeave(dateKey: string) {
    setDragOverDateKey((current) => (current === dateKey ? null : current));
  }

  function handleDayDrop(event: DragEvent<HTMLDivElement>, dateKey: string) {
    event.preventDefault();
    setDragOverDateKey(null);
    if (draggedTask && onDueDateChange && draggedTask.dueDate !== dateKey) {
      onDueDateChange(draggedTask, dateKey);
    }
    setDraggedTask(null);
  }

  function toggleExpandedDay(dateKey: string) {
    setExpandedDays((current) => {
      const next = new Set(current);
      if (next.has(dateKey)) {
        next.delete(dateKey);
      } else {
        next.add(dateKey);
      }
      return next;
    });
  }

  function goToPreviousMonth() {
    setViewedMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1));
  }

  function goToNextMonth() {
    setViewedMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1));
  }

  function goToToday() {
    setViewedMonth(startOfMonth(new Date()));
  }

  const weeks = buildMonthGrid(viewedMonth);
  const tasksByDueDate = groupTasksByDueDate(tasks);
  const todayKey = formatDateOnly(new Date());
  const isViewingCurrentMonth =
    viewedMonth.getFullYear() === new Date().getFullYear() &&
    viewedMonth.getMonth() === new Date().getMonth();

  return (
    <div className={styles.calendar}>
      <div className={styles.header}>
        <div className={styles.headerMain}>
          <h2 className={styles.monthTitle}>{formatMonthYear(viewedMonth)}</h2>
          <div className={styles.headerControls}>
            <button
              type="button"
              className={styles.navButton}
              aria-label={t("components.taskCalendar.previousMonth")}
              onClick={goToPreviousMonth}
            >
              ‹
            </button>
            <button
              type="button"
              className={styles.todayButton}
              data-active={isViewingCurrentMonth}
              disabled={isViewingCurrentMonth}
              onClick={goToToday}
            >
              {t("components.taskCalendar.today")}
            </button>
            <button
              type="button"
              className={styles.navButton}
              aria-label={t("components.taskCalendar.nextMonth")}
              onClick={goToNextMonth}
            >
              ›
            </button>
          </div>
        </div>

        {/* Il colore è l'unico canale che distingue gli stati sui dot: la
            legenda lo rende leggibile anche a chi non lo percepisce, e chiarisce
            il marker "!" senza doverlo scoprire cliccando ogni task. */}
        <div className={styles.legend}>
          {LEGEND_STATUSES.map((status) => (
            <span key={status} className={styles.legendItem}>
              <span
                className={`${styles.legendDot} ${STATUS_DOT_STYLES[status]}`}
                aria-hidden="true"
              />
              {STATUS_LABELS[status]}
            </span>
          ))}
          <span className={styles.legendItem}>
            <span className={styles.legendMarker} aria-hidden="true">
              !
            </span>
            {t("components.taskCalendar.legendDueOrOverdue")}
          </span>
        </div>
      </div>

      <div className={styles.gridScroll}>
        <div
          className={styles.grid}
          role="group"
          aria-label={t("components.taskCalendar.gridLabel", { month: formatMonthYear(viewedMonth) })}
        >
          <div className={styles.weekLabelHeaderCell} aria-hidden="true" />
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className={styles.weekdayHeaderCell}>
              {label}
            </div>
          ))}

          {weeks.map((week, weekIndex) => (
            <Fragment key={weekIndex}>
              <div className={styles.weekLabelCell}>
                {t("components.taskCalendar.weekLabel", { number: weekIndex + 1 })}
              </div>
              {week.map((cell) => {
                const dayTasks = tasksByDueDate.get(cell.dateKey) ?? [];
                const isToday = cell.dateKey === todayKey;
                const isExpanded = expandedDays.has(cell.dateKey);
                const hasOverflow = dayTasks.length > DOT_VISIBLE_LIMIT;
                const visibleTasks =
                  hasOverflow && !isExpanded ? dayTasks.slice(0, DOT_VISIBLE_LIMIT) : dayTasks;
                const extraCount = dayTasks.length - DOT_VISIBLE_LIMIT;
                return (
                  <div
                    key={cell.dateKey}
                    className={styles.dayCell}
                    data-muted={!cell.isCurrentMonth}
                    data-today={isToday}
                    data-drag-over={dragOverDateKey === cell.dateKey}
                    onDragOver={(event) => handleDayDragOver(event, cell.dateKey)}
                    onDragLeave={() => handleDayDragLeave(cell.dateKey)}
                    onDrop={(event) => handleDayDrop(event, cell.dateKey)}
                  >
                    <span className={styles.dayNumber}>{cell.date.getDate()}</span>
                    {dayTasks.length > 0 && (
                      <div className={styles.dots}>
                        {visibleTasks.map((task) => {
                          const overdue = isTaskOverdue(task);
                          const dueSoon = !overdue && isTaskDueSoon(task);
                          const dueState = overdue
                            ? t("components.taskCalendar.dotTitleOverdueSuffix")
                            : dueSoon
                              ? t("components.taskCalendar.dotTitleDueSoonSuffix")
                              : "";
                          const isDimmed = dimmedTaskIds?.has(task.id) ?? false;
                          return (
                            <button
                              key={task.id}
                              type="button"
                              className={`${styles.dot} ${STATUS_DOT_STYLES[task.status]} ${
                                overdue ? styles.dotOverdue : dueSoon ? styles.dotDueSoon : ""
                              }`}
                              data-dimmed={isDimmed}
                              data-dragging={draggedTask?.id === task.id}
                              draggable={onDueDateChange !== undefined && !task.invoiceId}
                              title={`${task.title} — ${STATUS_LABELS[task.status]}${dueState}`}
                              aria-label={task.title}
                              onClick={() => onOpenTask(task)}
                              onDragStart={(event) => handleDotDragStart(event, task)}
                              onDragEnd={handleDotDragEnd}
                            >
                              {(overdue || dueSoon) && (
                                <span aria-hidden="true" className={styles.dotExclamation}>
                                  !
                                </span>
                              )}
                            </button>
                          );
                        })}
                        {hasOverflow && (
                          <button
                            type="button"
                            className={styles.moreToggle}
                            aria-expanded={isExpanded}
                            aria-label={
                              isExpanded
                                ? t("components.taskCalendar.showFewer")
                                : t("components.taskCalendar.showMore", { count: extraCount })
                            }
                            onClick={() => toggleExpandedDay(cell.dateKey)}
                          >
                            {isExpanded ? "−" : `+${extraCount}`}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

export default TaskCalendarComponent;
