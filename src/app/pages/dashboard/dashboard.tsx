import { useState } from "react";
import ProjectComponent from "../../components/project/projectComponent";
import CreateProjectModalComponent from "../../components/createProjectModal/createProjectModalComponent";
import { getAllProjects } from "../../services/project/projectService";
import type { Project } from "../../../shared/types/project";
import styles from "./dashboard.module.css";

function Dashboard() {
  const [projects, setProjects] = useState<Project[]>(() => getAllProjects());
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  function handleCreateProject(name: string) {
    setProjects((current) => [
      ...current,
      { id: crypto.randomUUID(), name, tasks: [] },
    ]);
    setIsCreateModalOpen(false);
  }

  return (
    <div className={styles.dashboardContainer}>
      <header className={styles.dashboardHeader}>
        <span className={styles.dashboardEyebrow}>Hodum</span>
        <h1 className={styles.dashboardTitle}>I tuoi progetti</h1>
        <p className={styles.dashboardSubtitle}>
          {projects.length === 0
            ? "Nessun progetto attivo al momento."
            : `${projects.length} progett${projects.length === 1 ? "o" : "i"} attiv${projects.length === 1 ? "o" : "i"}.`}
        </p>
      </header>

      {projects.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyStateTitle}>Nessun progetto ancora</p>
          <p className={styles.emptyStateText}>
            I progetti che crei compariranno qui, pronti da aprire.
          </p>
        </div>
      ) : (
        <div className={styles.projectsGrid}>
          {projects.map((project) => (
            <ProjectComponent key={project.id} {...project} />
          ))}
        </div>
      )}

      <button
        type="button"
        className={styles.fabButton}
        aria-label="Crea nuovo progetto"
        onClick={() => setIsCreateModalOpen(true)}
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
        onClose={() => setIsCreateModalOpen(false)}
        onCreate={handleCreateProject}
      />
    </div>
  );
}

export default Dashboard;
