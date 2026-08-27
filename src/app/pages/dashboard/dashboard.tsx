import ProjectComponent from "../../components/project/projectComponent";
import type { Project } from "../../../shared/types/project";
import styles from "./dashboard.module.css";

const mockProjects: Project[] = [
  {
    id: "1",
    name: "Progetto Demo",
    completedTasks: 2,
    inProgressTasks: 2,
    reviewTasks: 2,
  },
];

function Dashboard() {
  return (
    <div className={styles.projectsGrid}>
      {mockProjects.map((project) => (
        <ProjectComponent key={project.id} {...project} />
      ))}
    </div>
  );
}

export default Dashboard;
