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
      <span className={styles.projectName}>{name}</span>
      <div className={styles.counts}>
        <span className={styles.countCompleted}>
          Completati: {completedCount}
        </span>
        <span className={styles.countInProgress}>
          In corso: {progressCount}
        </span>
        <span className={styles.countReview}>In review: {reviewCount}</span>
      </div>
      <div className={styles.progressBar}>
        <div
          className={styles.progressCompleted}
          style={{ width: `${completedPercent}%` }}
        />
        <div
          className={styles.progressInProgress}
          style={{ width: `${inProgressPercent}%` }}
        />
        <div
          className={styles.progressReview}
          style={{ width: `${reviewPercent}%` }}
        />
      </div>
    </div>
  );
}

export default ProjectComponent;
