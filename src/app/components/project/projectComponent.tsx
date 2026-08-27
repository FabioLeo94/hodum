import type { KeyboardEvent } from "react";
import { useRef } from "react";
import { useNavigate } from "react-router";
import type { Project } from "../../../shared/types/project";
import styles from "./projectComponent.module.css";

function ProjectComponent({ id, name, tasks }: Project) {
  const navigate = useNavigate();
  const hasNavigatedRef = useRef(false);

  const totalTasks = tasks.length;
  const completedCount = tasks.filter((t) => t.status === "completed").length;
  const progressCount = tasks.filter((t) => t.status === "progress").length;
  const reviewCount = tasks.filter((t) => t.status === "review").length;
  const completedPercent =
    totalTasks === 0 ? 0 : (completedCount / totalTasks) * 100;
  const inProgressPercent =
    totalTasks === 0 ? 0 : (progressCount / totalTasks) * 100;
  const reviewPercent = totalTasks === 0 ? 0 : (reviewCount / totalTasks) * 100;

  const segments = [
    {
      key: "completed",
      label: "Completati",
      count: completedCount,
      percent: completedPercent,
      className: styles.progressCompleted,
    },
    {
      key: "progress",
      label: "In corso",
      count: progressCount,
      percent: inProgressPercent,
      className: styles.progressInProgress,
    },
    {
      key: "review",
      label: "In review",
      count: reviewCount,
      percent: reviewPercent,
      className: styles.progressReview,
    },
  ].filter((segment) => segment.percent > 0);

  function handleActivate() {
    if (hasNavigatedRef.current) return;
    hasNavigatedRef.current = true;
    navigate(`/dashboard/${id}/task-list`);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleActivate();
    }
  }

  return (
    <div
      className={styles.projectCard}
      role="button"
      tabIndex={0}
      onClick={handleActivate}
      onKeyDown={handleKeyDown}
    >
      <div className={styles.cardHeader}>
        <span className={styles.projectName} title={name}>
          {name}
        </span>
        <span className={styles.taskTotal}>{totalTasks} task</span>
      </div>
      <div className={styles.progressBar}>
        {segments.map((segment) => (
          <div
            key={segment.key}
            className={`${styles.progressSegment} ${segment.className}`}
            style={{ width: `${segment.percent}%` }}
            role="img"
            aria-label={`${segment.count} ${segment.label}`}
            data-tooltip={`${segment.count} ${segment.label}`}
          />
        ))}
      </div>
    </div>
  );
}

export default ProjectComponent;
