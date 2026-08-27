import { Link, useParams } from "react-router";
import type { Task, TaskStatus } from "../../../shared/types/project";
import { getProjectById } from "../../services/project/projectService";
import styles from "./taskList.module.css";

const STATUS_ORDER: TaskStatus[] = ["progress", "review", "completed", "rejected"];

const STATUS_LABELS: Record<TaskStatus, string> = {
  progress: "In corso",
  review: "In review",
  completed: "Completati",
  rejected: "Rifiutati",
};

const STATUS_STYLES: Record<TaskStatus, string> = {
  progress: styles.groupHeaderProgress,
  review: styles.groupHeaderReview,
  completed: styles.groupHeaderCompleted,
  rejected: styles.groupHeaderRejected,
};

function groupTasksByStatus(tasks: Task[]): Record<TaskStatus, Task[]> {
  const groups: Record<TaskStatus, Task[]> = {
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

function TaskList() {
  const { progettoId } = useParams<{ progettoId: string }>();
  const project = progettoId ? getProjectById(progettoId) : undefined;

  if (!project) {
    return (
      <div className={styles.taskListContainer}>
        <Link className={styles.backLink} to="/dashboard">
          Torna alla dashboard
        </Link>
        <div className={styles.notFoundState}>
          <p className={styles.errorMessage}>Progetto non trovato.</p>
          <p className={styles.notFoundText}>
            Il progetto richiesto non esiste o è stato rimosso.
          </p>
        </div>
      </div>
    );
  }

  const groupedTasks = groupTasksByStatus(project.tasks);

  return (
    <div className={styles.taskListContainer}>
      <Link className={styles.backLink} to="/dashboard">
        Torna alla dashboard
      </Link>
      <header className={styles.taskListHeader}>
        <span className={styles.taskListEyebrow}>Progetto</span>
        <h1 className={styles.taskListTitle}>{project.name}</h1>
      </header>
      <div className={styles.taskTableCard}>
        <table className={styles.taskTable}>
          <thead>
            <tr>
              <th>Titolo</th>
              <th>Descrizione</th>
              <th>Tag</th>
            </tr>
          </thead>
          <tbody>
            {STATUS_ORDER.flatMap((status) => {
              const tasks = groupedTasks[status];
              const rows = [
                <tr key={`${status}-header`}>
                  <th
                    className={`${styles.groupHeaderCell} ${STATUS_STYLES[status]}`}
                    colSpan={3}
                  >
                    {STATUS_LABELS[status]} ({tasks.length})
                  </th>
                </tr>,
              ];
              if (tasks.length === 0) {
                rows.push(
                  <tr key={`${status}-empty`}>
                    <td className={styles.emptyRow} colSpan={3}>
                      Nessun task
                    </td>
                  </tr>,
                );
              } else {
                tasks.forEach((task, index) => {
                  rows.push(
                    <tr key={`${status}-${index}`} className={styles.taskRow}>
                      <td>{task.title}</td>
                      <td>{task.description}</td>
                      <td>
                        {task.tags.length === 0 ? (
                          <span className={styles.noTags}>—</span>
                        ) : (
                          <div className={styles.tagList}>
                            {task.tags.map((tag, tagIndex) => (
                              <span
                                key={`${tag}-${tagIndex}`}
                                className={styles.tagPill}
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>,
                  );
                });
              }
              return rows;
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default TaskList;
