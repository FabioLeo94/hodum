import { Fragment, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import ProjectComponent from "../../components/project/projectComponent";
import CreateProjectModalComponent from "../../components/createProjectModal/createProjectModalComponent";
import TopbarComponent from "../../components/topbar/topbarComponent";
import { createProject, getAllProjects } from "../../services/project/projectService";
import { logout } from "../../services/auth/authService";
import type { Project } from "../../../shared/types/project";
import styles from "./dashboard.module.css";

function Dashboard() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createError, setCreateError] = useState("");

  useEffect(() => {
    let cancelled = false;

    getAllProjects()
      .then((data) => {
        if (!cancelled) setProjects(data);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Impossibile caricare i progetti.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function handleLogout() {
    logout();
    navigate("/auth");
  }

  function openCreateModal() {
    setCreateError("");
    setIsCreateModalOpen(true);
  }

  function closeCreateModal() {
    setCreateError("");
    setIsCreateModalOpen(false);
  }

  async function handleCreateProject(name: string) {
    try {
      const project = await createProject(name);
      setProjects((current) => [...current, project]);
      closeCreateModal();
    } catch (error) {
      setCreateError(
        error instanceof Error
          ? error.message
          : "Impossibile creare il progetto.",
      );
    }
  }

  return (
    <Fragment>
      <TopbarComponent onLogout={handleLogout} />
      <div className={styles.dashboardContainer}>
        <header className={styles.dashboardHeader}>
          <span className={styles.dashboardEyebrow}>Hodum</span>
          <h1 className={styles.dashboardTitle}>I tuoi progetti</h1>
          <p className={styles.dashboardSubtitle}>
            {isLoading
              ? "Caricamento dei progetti..."
              : projects.length === 0
                ? "Nessun progetto attivo al momento."
                : `${projects.length} progett${projects.length === 1 ? "o" : "i"} attiv${projects.length === 1 ? "o" : "i"}.`}
          </p>
        </header>

        {loadError ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyStateTitle}>Errore di caricamento</p>
            <p className={styles.emptyStateText}>{loadError}</p>
          </div>
        ) : !isLoading && projects.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyStateTitle}>Nessun progetto ancora</p>
            <p className={styles.emptyStateText}>
              I progetti che crei compariranno qui, pronti da aprire.
            </p>
          </div>
        ) : !isLoading ? (
          <div className={styles.projectsGrid}>
            {projects.map((project) => (
              <ProjectComponent key={project.id} {...project} />
            ))}
          </div>
        ) : null}

        <button
          type="button"
          className={styles.fabButton}
          aria-label="Crea nuovo progetto"
          onClick={openCreateModal}
        >
          <svg
            className={styles.fabIcon}
            viewBox="0 0 24 24"
            width="24"
            height="24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>

        <CreateProjectModalComponent
          isOpen={isCreateModalOpen}
          onClose={closeCreateModal}
          onCreate={handleCreateProject}
          submitError={createError}
        />
      </div>
    </Fragment>
  );
}

export default Dashboard;
