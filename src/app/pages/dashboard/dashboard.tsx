import { Fragment, useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router";
import ProjectComponent from "../../components/project/projectComponent";
import CreateProjectModalComponent from "../../components/createProjectModal/createProjectModalComponent";
import TopbarComponent from "../../components/topbar/topbarComponent";
import type { AssistantLayoutContext } from "../../components/protectedLayout/protectedLayoutComponent";
import {
  createProject,
  deleteProject,
  getAllProjects,
  updateProject,
} from "../../services/project/projectService";
import { subscribeToProjects } from "../../services/realtime/socketService";
import { getUser, logout } from "../../services/auth/authService";
import type { Project } from "../../../shared/types/project";
import { usePageMeta } from "../../../shared/hooks/usePageMeta";
import styles from "./dashboard.module.css";

function Dashboard() {
  const navigate = useNavigate();
  // Assente (undefined) quando il componente è renderizzato fuori dal layout
  // protetto (es. nei test): in quel caso il FAB resta nella posizione base.
  const outletContext = useOutletContext<AssistantLayoutContext | undefined>();
  const isAssistantOpen = outletContext?.isAssistantOpen ?? false;
  const setHasLocalFab = outletContext?.setHasLocalFab;
  usePageMeta({ title: "Dashboard", robots: "noindex, nofollow" });
  // Task "Gestione del dipendente": un dipendente vede solo i progetti a lui
  // assegnati (già filtrati dal backend, vedi getAllProjects) e non può
  // creare progetti né gestirli (rinomina/elimina), solo lavorare sui task
  // al loro interno.
  const canManage = getUser()?.role === "owner";
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createError, setCreateError] = useState("");

  // Il FAB "+" sotto è nascosto ai dipendenti (canManage false): senza questo
  // effect l'icona dell'assistente (montata nel layout, non qui) resterebbe
  // scostata come se il FAB ci fosse, lasciando un vuoto nell'angolo. Il
  // cleanup riporta il layout al default (true) quando si esce dalla
  // dashboard, per non "sporcare" le altre pagine che hanno sempre un FAB.
  useEffect(() => {
    setHasLocalFab?.(canManage);
    return () => setHasLocalFab?.(true);
  }, [canManage, setHasLocalFab]);

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

  // Riflette in tempo reale progetti creati/rinominati/eliminati altrove
  // (un'altra tab/utente): i progetti sono pochi e le mutazioni infrequenti,
  // quindi qui basta applicare il delta senza rifare un fetch completo.
  useEffect(() => {
    const unsubscribe = subscribeToProjects({
      onProjectCreated: (project) => {
        setProjects((current) => {
          if (current.some((existing) => existing.id === project.id)) {
            return current;
          }
          return [...current, { id: project.id, name: project.name, tasks: [] }];
        });
      },
      onProjectUpdated: (project) => {
        setProjects((current) =>
          current.map((existing) =>
            existing.id === project.id ? { ...existing, name: project.name } : existing,
          ),
        );
      },
      onProjectDeleted: (projectId) => {
        setProjects((current) => current.filter((project) => project.id !== projectId));
      },
    });

    return unsubscribe;
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
      setProjects((current) =>
        current.some((existing) => existing.id === project.id)
          ? current
          : [...current, project],
      );
      closeCreateModal();
    } catch (error) {
      setCreateError(
        error instanceof Error
          ? error.message
          : "Impossibile creare il progetto.",
      );
    }
  }

  async function handleRenameProject(id: string, name: string) {
    const updated = await updateProject(id, name);
    setProjects((current) =>
      current.map((project) =>
        project.id === id ? { ...project, name: updated.name } : project,
      ),
    );
  }

  async function handleDeleteProject(id: string) {
    await deleteProject(id);
    setProjects((current) => current.filter((project) => project.id !== id));
  }

  return (
    <Fragment>
      <TopbarComponent onLogout={handleLogout} />
      <div className={styles.dashboardContainer}>
        <header className={styles.dashboardHeader}>
          <h1 className={styles.dashboardTitle}>I tuoi progetti</h1>
          <p className={styles.dashboardSubtitle} role="status">
            {isLoading
              ? "Caricamento dei progetti..."
              : projects.length === 0
                ? "Nessun progetto attivo al momento."
                : `${projects.length} progett${projects.length === 1 ? "o" : "i"} attiv${projects.length === 1 ? "o" : "i"}.`}
          </p>
        </header>

        {loadError ? (
          <div className={styles.emptyState} data-variant="error" role="alert">
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
              <ProjectComponent
                key={project.id}
                {...project}
                canManage={canManage}
                onRenameProject={handleRenameProject}
                onDeleteProject={handleDeleteProject}
              />
            ))}
          </div>
        ) : null}

        {canManage && (
          <Fragment>
            <button
              type="button"
              className={styles.fabButton}
              data-assistant-open={isAssistantOpen}
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
          </Fragment>
        )}
      </div>
    </Fragment>
  );
}

export default Dashboard;
