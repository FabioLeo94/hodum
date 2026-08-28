import type { TaskStatus } from "../../../shared/types/project";
import styles from "./taskStatusSelectComponent.module.css";

const STATUS_LABELS: Record<TaskStatus, string> = {
  progress: "In corso",
  review: "In review",
  completed: "Completato",
  rejected: "Rifiutato",
};

const STATUS_STYLES: Record<TaskStatus, string> = {
  progress: styles.statusProgress,
  review: styles.statusReview,
  completed: styles.statusCompleted,
  rejected: styles.statusRejected,
};

interface Prop {
  status: TaskStatus;
  onChange: (status: TaskStatus) => void;
  taskTitle: string;
  disabled?: boolean;
}

function TaskStatusSelectComponent({
  status,
  onChange,
  taskTitle,
  disabled = false,
}: Prop) {
  return (
    <select
      className={`${styles.statusSelect} ${STATUS_STYLES[status]}`}
      aria-label={`Stato di ${taskTitle}`}
      value={status}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as TaskStatus)}
    >
      {(Object.keys(STATUS_LABELS) as TaskStatus[]).map((value) => (
        <option key={value} value={value}>
          {STATUS_LABELS[value]}
        </option>
      ))}
    </select>
  );
}

export default TaskStatusSelectComponent;
