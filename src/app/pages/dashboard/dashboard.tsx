import ProjectComponent from "../../components/project/projectComponent";
import { getAllProjects } from "../../services/project/projectService";
import styles from "./dashboard.module.css";

function Dashboard() {
  const projects = getAllProjects();

  return (
    <div className={styles.projectsGrid}>
      {projects.map((project) => (
        <ProjectComponent key={project.id} {...project} />
      ))}
    </div>
  );
}

export default Dashboard;
