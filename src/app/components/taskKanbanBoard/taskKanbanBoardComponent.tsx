import { useState } from "react";
import type { DragEvent } from "react";
import { useTranslation } from "react-i18next";
import type { Task, TaskStatus, WorkTimerAction } from "../../../shared/types/project";
import { STATUS_ORDER, useStatusGroupLabels } from "../../../shared/constants/taskStatus";
import { getDueUrgency } from "../../../shared/utils/taskDueDate";
import type { User } from "../../services/auth/authService";
import TaskStatusSelectComponent from "../taskStatusSelect/taskStatusSelectComponent";
import PrioritySelectComponent from "../prioritySelect/prioritySelectComponent";
import TaskAssigneesComponent from "../taskAssignees/taskAssigneesComponent";
import TaskWorkTimerComponent from "../taskWorkTimer/taskWorkTimerComponent";
import TaskLockedBadgeComponent from "../taskLockedBadge/taskLockedBadgeComponent";
import styles from "./taskKanbanBoardComponent.module.css";

const COLUMN_STYLES: Record<TaskStatus, string> = {
  progress: styles.columnHeaderProgress,
  review: styles.columnHeaderReview,
  completed: styles.columnHeaderCompleted,
  rejected: styles.columnHeaderRejected,
};

const COLUMN_COUNT_STYLES: Record<TaskStatus, string> = {
  progress: styles.columnCountProgress,
  review: styles.columnCountReview,
  completed: styles.columnCountCompleted,
  rejected: styles.columnCountRejected,
};

interface TaskKanbanBoardComponentProps {
  groupedTasks: Record<TaskStatus, Task[]>;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  onPriorityChange: (taskId: string, priority: number) => void;
  onOpenTask: (task: Task) => void;
  employees: User[];
  onAssigneesChange: (taskId: string, userIds: string[]) => void;
  onWorkTimerAction: (taskId: string, action: WorkTimerAction) => void;
  /** True quando la toolbar di ricerca/filtri di taskList.tsx ha almeno un
   * criterio attivo: distingue "colonna vuota perché non ci sono task in
   * questo stato" da "colonna vuota perché i filtri hanno escluso tutto". */
  hasActiveFilters?: boolean;
}

// Il drag & drop tra colonne è incapsulato qui (stato dragOverStatus locale):
// il chiamante riceve solo l'esito (onStatusChange), come farebbe con un
// select di stato, e non deve conoscere i dettagli dell'interazione HTML5
// Drag API. Stesso pattern nativo già usato dalla vista lista (taskList.tsx).
function TaskKanbanBoardComponent({
  groupedTasks,
  onStatusChange,
  onPriorityChange,
  onOpenTask,
  employees,
  onAssigneesChange,
  onWorkTimerAction,
  hasActiveFilters = false,
}: TaskKanbanBoardComponentProps) {
  const { t } = useTranslation();
  const STATUS_GROUP_LABELS = useStatusGroupLabels();
  const [dragOverStatus, setDragOverStatus] = useState<TaskStatus | null>(null);
  // Stato di partenza del drag, catturato al dragstart invece di essere
  // ricercato in groupedTasks al drop: groupedTasks riflette ora i filtri
  // attivi, quindi un aggiornamento realtime che fa uscire il task trascinato
  // dal set filtrato (es. un altro utente ne cambia l'assegnatario mentre il
  // filtro assegnatario è attivo) farebbe fallire silenziosamente la ricerca
  // e quindi il drop, senza che l'utente capisca perché.
  const [draggedTaskStatus, setDraggedTaskStatus] = useState<TaskStatus | null>(null);

  function handleCardDragStart(
    event: DragEvent<HTMLDivElement>,
    taskId: string,
    status: TaskStatus,
  ) {
    event.dataTransfer.setData("text/plain", taskId);
    event.dataTransfer.effectAllowed = "move";
    setDraggedTaskStatus(status);
  }

  function handleCardDragEnd() {
    setDragOverStatus(null);
    setDraggedTaskStatus(null);
  }

  function handleColumnDragOver(event: DragEvent<HTMLDivElement>, status: TaskStatus) {
    event.preventDefault();
    setDragOverStatus(status);
  }

  function handleColumnDragLeave() {
    setDragOverStatus(null);
  }

  function handleColumnDrop(event: DragEvent<HTMLDivElement>, status: TaskStatus) {
    event.preventDefault();
    setDragOverStatus(null);
    const taskId = event.dataTransfer.getData("text/plain");
    if (taskId && draggedTaskStatus !== null && draggedTaskStatus !== status) {
      onStatusChange(taskId, status);
    }
    setDraggedTaskStatus(null);
  }

  return (
    <div className={styles.board} role="group" aria-label={t("components.taskKanbanBoard.ariaLabel")}>
      {STATUS_ORDER.map((status) => {
        const tasks = groupedTasks[status];
        return (
          <div
            key={status}
            className={`${styles.column} ${dragOverStatus === status ? styles.columnDragOver : ""}`}
            onDragOver={(event) => handleColumnDragOver(event, status)}
            onDragLeave={handleColumnDragLeave}
            onDrop={(event) => handleColumnDrop(event, status)}
          >
            <div className={`${styles.columnHeader} ${COLUMN_STYLES[status]}`}>
              <span>{STATUS_GROUP_LABELS[status]}</span>
              <span className={`${styles.columnCount} ${COLUMN_COUNT_STYLES[status]}`}>
                {tasks.length}
              </span>
            </div>
            <div className={styles.columnBody}>
              {tasks.length === 0 ? (
                <p className={styles.emptyColumn} data-drop-target={dragOverStatus === status}>
                  {dragOverStatus === status
                    ? t("components.taskKanbanBoard.dropHere")
                    : hasActiveFilters
                      ? t("components.taskKanbanBoard.noMatchingTasks")
                      : t("components.taskKanbanBoard.noTasks")}
                </p>
              ) : (
                tasks.map((task) => {
                  const urgency = getDueUrgency(task, t);
                  const isLocked = Boolean(task.invoiceId);
                  return (
                  <div
                    key={task.id}
                    className={styles.card}
                    draggable={!isLocked}
                    onDragStart={(event) => handleCardDragStart(event, task.id, task.status)}
                    onDragEnd={handleCardDragEnd}
                  >
                    <div className={styles.cardTitleRow}>
                      <button
                        type="button"
                        className={styles.cardTitle}
                        onClick={() => onOpenTask(task)}
                      >
                        {task.title}
                      </button>
                      {isLocked && <TaskLockedBadgeComponent />}
                    </div>
                    {urgency && (
                      <span
                        className={`${styles.urgencyTag} ${
                          urgency.level === "overdue"
                            ? styles.urgencyTagOverdue
                            : styles.urgencyTagDueSoon
                        }`}
                      >
                        {urgency.label}
                      </span>
                    )}
                    {task.description && (
                      <p className={styles.cardDescription} title={task.description}>
                        {task.description}
                      </p>
                    )}
                    <div className={styles.cardFooter}>
                      <TaskStatusSelectComponent
                        status={task.status}
                        taskTitle={task.title}
                        onChange={(newStatus) => onStatusChange(task.id, newStatus)}
                        disabled={isLocked}
                      />
                      <PrioritySelectComponent
                        priority={task.priority}
                        taskTitle={task.title}
                        onChange={(newPriority) => onPriorityChange(task.id, newPriority)}
                        disabled={isLocked}
                      />
                      <TaskAssigneesComponent
                        employees={employees}
                        selectedIds={task.assignees.map((assignee) => assignee.id)}
                        taskTitle={task.title}
                        onChange={(userIds) => onAssigneesChange(task.id, userIds)}
                        disabled={isLocked}
                      />
                    </div>
                    <div className={styles.cardWorkTimer}>
                      <TaskWorkTimerComponent
                        status={task.status}
                        taskTitle={task.title}
                        workStartedAt={task.workStartedAt}
                        workAccumulatedSeconds={task.workAccumulatedSeconds}
                        workEndedAt={task.workEndedAt}
                        onAction={(action) => onWorkTimerAction(task.id, action)}
                        disabled={isLocked}
                      />
                    </div>
                  </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default TaskKanbanBoardComponent;
