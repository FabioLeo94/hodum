import ProjectComponent from "../../components/project/projectComponent";
import { getAllProjects } from "../../services/project/projectService";
import styles from "./dashboard.module.css";

function Dashboard() {
  const projects = getAllProjects();

  return (
    <div className={styles.dashboardContainer}>
      <header className={styles.dashboardHeader}>
        <span className={styles.dashboardEyebrow}>Task Manager</span>
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
    </div>
  );
}

export default Dashboard;
