import type { KeyboardEvent } from "react";
import type { Project } from "../../../shared/types/project";
import styles from "./projectComponent.module.css";

function ProjectComponent({
  id,
  name,
  completedTasks,
  inProgressTasks,
  reviewTasks,
}: Project) {
  const totalTasks = completedTasks + inProgressTasks + reviewTasks;
  const completedPercent = totalTasks === 0 ? 0 : (completedTasks / totalTasks) * 100;
  const inProgressPercent = totalTasks === 0 ? 0 : (inProgressTasks / totalTasks) * 100;
  const reviewPercent = totalTasks === 0 ? 0 : (reviewTasks / totalTasks) * 100;

  function handleActivate() {
    console.debug(`Progetto cliccato: ${name} (id: ${id})`);
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
          Completati: {completedTasks}
        </span>
        <span className={styles.countInProgress}>
          In corso: {inProgressTasks}
        </span>
        <span className={styles.countReview}>In review: {reviewTasks}</span>
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
