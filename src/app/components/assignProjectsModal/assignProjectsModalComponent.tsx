import { useEffect, useState } from "react";
import ModalBaseComponent from "../modalBase/modalBaseComponent";
import ButtonComponent from "../button/buttonComponent";
import {
  listProjectsSummary,
  type ProjectSummary,
} from "../../services/project/projectService";
import { getAssignedProjectIds } from "../../services/user/userService";
import styles from "./assignProjectsModalComponent.module.css";

interface Prop {
  isOpen: boolean;
  onClose: () => void;
  employeeId: string;
  employeeUsername: string;
  onSave: (projectIds: string[]) => void | Promise<void>;
  submitError?: string;
}

function AssignProjectsModalComponent({
  isOpen,
  onClose,
  employeeId,
  employeeUsername,
  onSave,
  submitError,
}: Prop) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Il chiamante rimonta questo componente (via `key`) ogni volta che si
  // apre, stesso pattern delle altre modali: qui basta un effect al mount,
  // niente risincronizzazione quando isOpen cambia.
  useEffect(() => {
    let cancelled = false;

    Promise.all([listProjectsSummary(), getAssignedProjectIds(employeeId)])
      .then(([allProjects, assignedIds]) => {
        if (cancelled) return;
        setProjects(allProjects);
        setSelectedIds(assignedIds);
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
  }, [employeeId]);

  function toggleProject(projectId: string) {
    setSelectedIds((current) =>
      current.includes(projectId)
        ? current.filter((id) => id !== projectId)
        : [...current, projectId],
    );
  }

  function handleClose() {
    onClose();
  }

  async function handleSave() {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSave(selectedIds);
    } catch {
      // onSave è responsabile di segnalare l'errore tramite submitError;
      // qui si intercetta solo per evitare una unhandled rejection e permettere il retry.
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ModalBaseComponent
      isOpen={isOpen}
      onClose={handleClose}
      title={`Assegna progetti a ${employeeUsername}`}
      onSubmit={handleSave}
      primaryAction={
        <ButtonComponent onClick={() => {}} disabled={isSubmitting || isLoading}>
          {isSubmitting ? "Salvataggio in corso..." : "Salva"}
        </ButtonComponent>
      }
      secondaryActions={
        <button
          type="button"
          className={styles.cancelButton}
          onClick={handleClose}
        >
          Annulla
        </button>
      }
    >
      {isLoading ? (
        <p className={styles.statusText} role="status">
          Caricamento dei progetti...
        </p>
      ) : loadError ? (
        <p role="alert" className={styles.submitError}>
          {loadError}
        </p>
      ) : projects.length === 0 ? (
        <p className={styles.statusText}>
          Nessun progetto disponibile in azienda.
        </p>
      ) : (
        <ul className={styles.projectList}>
          {projects.map((project) => (
            <li key={project.id} className={styles.projectItem}>
              <label className={styles.projectLabel}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={selectedIds.includes(project.id)}
                  onChange={() => toggleProject(project.id)}
                />
                {project.name}
              </label>
            </li>
          ))}
        </ul>
      )}
      {submitError && (
        <p role="alert" className={styles.submitError}>
          {submitError}
        </p>
      )}
    </ModalBaseComponent>
  );
}

export default AssignProjectsModalComponent;
