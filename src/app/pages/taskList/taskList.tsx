import { Fragment, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import type { Project, Task, TaskStatus } from "../../../shared/types/project";
import { getProjectById } from "../../services/project/projectService";
import { logout } from "../../services/auth/authService";
import TopbarComponent from "../../components/topbar/topbarComponent";
import { usePageMeta } from "../../../shared/hooks/usePageMeta";
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

function useLogoutHandler() {
  const navigate = useNavigate();
  return function handleLogout() {
    logout();
    navigate("/auth");
  };
}

interface TaskListContentProps {
  progettoId: string;
}

// Componente separato, montato con key={progettoId}: un cambio di progetto
// rimonta l'albero invece di richiedere un reset manuale di isLoading/loadError
// nell'effect (pattern richiesto da react-hooks/set-state-in-effect).
function TaskListContent({ progettoId }: TaskListContentProps) {
  const handleLogout = useLogoutHandler();
  const [project, setProject] = useState<Project | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  usePageMeta({
    title: project ? project.name : "Progetto",
    robots: "noindex, nofollow",
  });

  useEffect(() => {
    let cancelled = false;

    getProjectById(progettoId)
      .then((data) => {
        if (!cancelled) setProject(data);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Impossibile caricare il progetto.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [progettoId]);

  if (isLoading) {
    return (
      <Fragment>
        <TopbarComponent onLogout={handleLogout} />
        <div className={styles.taskListContainer}>
          <Link className={styles.backLink} to="/dashboard">
            Torna alla dashboard
          </Link>
          <p className={styles.notFoundText} role="status">
            Caricamento in corso...
          </p>
        </div>
      </Fragment>
    );
  }

  if (loadError) {
    return (
      <Fragment>
        <TopbarComponent onLogout={handleLogout} />
        <div className={styles.taskListContainer}>
          <Link className={styles.backLink} to="/dashboard">
            Torna alla dashboard
          </Link>
          <div className={styles.notFoundState} data-variant="error" role="alert">
            <p className={styles.errorMessage}>Errore di caricamento.</p>
            <p className={styles.notFoundText}>{loadError}</p>
          </div>
        </div>
      </Fragment>
    );
  }

  if (!project) {
    return (
      <Fragment>
        <TopbarComponent onLogout={handleLogout} />
        <div className={styles.taskListContainer}>
          <Link className={styles.backLink} to="/dashboard">
            Torna alla dashboard
          </Link>
          <div className={styles.notFoundState} role="alert">
            <p className={styles.errorMessage}>Progetto non trovato.</p>
            <p className={styles.notFoundText}>
              Il progetto richiesto non esiste o è stato rimosso.
            </p>
          </div>
        </div>
      </Fragment>
    );
  }

  const groupedTasks = groupTasksByStatus(project.tasks);

  return (
    <Fragment>
      <TopbarComponent onLogout={handleLogout} />
      <div className={styles.taskListContainer}>
        <Link className={styles.backLink} to="/dashboard">
          Torna alla dashboard
        </Link>
        <header className={styles.taskListHeader}>
          <h1 className={styles.taskListTitle}>{project.name}</h1>
        </header>
        <div className={styles.taskTableCard}>
          <table className={styles.taskTable}>
            <caption className={styles.srOnly}>
              Task del progetto {project.name}, raggruppati per stato
            </caption>
            <thead>
              <tr>
                <th scope="col">Titolo</th>
                <th scope="col">Descrizione</th>
              </tr>
            </thead>
            <tbody>
              {STATUS_ORDER.flatMap((status) => {
                const tasks = groupedTasks[status];
                const rows = [
                  <tr key={`${status}-header`}>
                    <th
                      className={`${styles.groupHeaderCell} ${STATUS_STYLES[status]}`}
                      colSpan={2}
                      scope="colgroup"
                    >
                      {STATUS_LABELS[status]} ({tasks.length})
                    </th>
                  </tr>,
                ];
                if (tasks.length === 0) {
                  rows.push(
                    <tr key={`${status}-empty`}>
                      <td className={styles.emptyRow} colSpan={2}>
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
    </Fragment>
  );
}

// Componente separato per lo stesso motivo di TaskListContent: il title/meta va
// impostato solo quando questo ramo è effettivamente montato, non ad ogni render
// di TaskList (che altrimenti sovrascriverebbe il title impostato da TaskListContent).
function TaskListMissingProject() {
  const handleLogout = useLogoutHandler();

  usePageMeta({ title: "Progetto non trovato", robots: "noindex, nofollow" });

  return (
    <Fragment>
      <TopbarComponent onLogout={handleLogout} />
      <div className={styles.taskListContainer}>
        <Link className={styles.backLink} to="/dashboard">
          Torna alla dashboard
        </Link>
        <div className={styles.notFoundState} role="alert">
          <p className={styles.errorMessage}>Progetto non trovato.</p>
          <p className={styles.notFoundText}>
            Il progetto richiesto non esiste o è stato rimosso.
          </p>
        </div>
      </div>
    </Fragment>
  );
}

function TaskList() {
  const { progettoId } = useParams<{ progettoId: string }>();

  if (!progettoId) {
    return <TaskListMissingProject />;
  }

  return <TaskListContent key={progettoId} progettoId={progettoId} />;
}

export default TaskList;
