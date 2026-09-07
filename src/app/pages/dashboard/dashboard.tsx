import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router";
import { useTranslation } from "react-i18next";
import { Plus, Upload } from "lucide-react";
import ProjectComponent from "../../components/project/projectComponent";
import CreateProjectModalComponent from "../../components/createProjectModal/createProjectModalComponent";
import ImportProjectModalComponent from "../../components/importProjectModal/importProjectModalComponent";
import TopbarComponent from "../../components/topbar/topbarComponent";
import TaskCalendarComponent from "../../components/taskCalendar/taskCalendarComponent";
import TaskDetailModalComponent from "../../components/taskDetailModal/taskDetailModalComponent";
import MessageCardComponent from "../../components/messageCard/messageCardComponent";
import type { AssistantLayoutContext } from "../../components/protectedLayout/protectedLayoutComponent";
import {
  createProject,
  createTask,
  deleteProject,
  getAllCompanyTasks,
  getAllProjects,
  getProjectById,
  updateProject,
  updateTask,
} from "../../services/project/projectService";
import { subscribeToProjects } from "../../services/realtime/socketService";
import { logout, useAuthUser } from "../../services/auth/authService";
import { notifySuccess, notifyWarning } from "../../services/notify/notifyService";
import type {
  Project,
  Task,
  TaskWithProject,
} from "../../../shared/types/project";
import type { ParsedProjectImport } from "../../../shared/utils/projectImport";
import type { EditProjectFormValues } from "../../components/editProjectModal/editProjectModalComponent";
import { usePageMeta } from "../../../shared/hooks/usePageMeta";
import styles from "./dashboard.module.css";

function Dashboard() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  // Assente (undefined) quando il componente è renderizzato fuori dal layout
  // protetto (es. nei test): in quel caso il FAB resta nella posizione base.
  const outletContext = useOutletContext<AssistantLayoutContext | undefined>();
  const isAssistantOpen = outletContext?.isAssistantOpen ?? false;
  const setHasLocalFab = outletContext?.setHasLocalFab;
  usePageMeta({ title: t("pages.dashboard.meta.title"), robots: "noindex, nofollow" });
  // Task "Gestione del dipendente" + "Ruolo project manager": un dipendente
  // vede solo i progetti a lui assegnati (già filtrati dal backend, vedi
  // getAllProjects) e non può creare progetti né gestirli (rinomina/elimina),
  // solo lavorare sui task al loro interno. Owner e project manager hanno
  // invece pieno accesso di gestione (stesso @Security('manager') lato
  // backend, vedi projectController.ts). useAuthUser (invece di getUser
  // diretto) fa ri-renderizzare la dashboard quando arriva 'user:updated',
  // così una promozione a manager sblocca subito la UI di gestione.
  const role = useAuthUser()?.role;
  const canManage = role === "owner" || role === "manager";
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createError, setCreateError] = useState("");
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importError, setImportError] = useState("");
  // Calendario aggregato (task di tutti i progetti): fetch singola all'mount,
  // nessuna sincronizzazione realtime in questa v1 (a differenza di projects
  // sopra) — riaprire/navigare la dashboard basta per un refresh, e aggregare
  // eventi socket cross-progetto qui non è richiesto.
  const [companyTasks, setCompanyTasks] = useState<TaskWithProject[]>([]);
  const [isCalendarLoading, setIsCalendarLoading] = useState(true);
  const [calendarLoadError, setCalendarLoadError] = useState("");
  const [calendarUpdateError, setCalendarUpdateError] = useState("");
  const [selectedTask, setSelectedTask] = useState<TaskWithProject | null>(
    null,
  );

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
            error instanceof Error ? error.message : t("pages.dashboard.loadError"),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [t]);

  useEffect(() => {
    let cancelled = false;

    getAllCompanyTasks()
      .then((data) => {
        if (!cancelled) setCompanyTasks(data);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setCalendarLoadError(
            error instanceof Error ? error.message : t("pages.dashboard.calendarLoadError"),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsCalendarLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [t]);

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
          return [
            ...current,
            { id: project.id, name: project.name, customerId: project.customerId, tasks: [] },
          ];
        });
      },
      onProjectUpdated: (project) => {
        setProjects((current) =>
          current.map((existing) =>
            existing.id === project.id
              ? { ...existing, name: project.name, customerId: project.customerId }
              : existing,
          ),
        );
      },
      onProjectDeleted: (projectId) => {
        setProjects((current) =>
          current.filter((project) => project.id !== projectId),
        );
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
        error instanceof Error ? error.message : t("pages.dashboard.createError"),
      );
    }
  }

  function openImportModal() {
    setImportError("");
    setIsImportModalOpen(true);
  }

  function closeImportModal() {
    setImportError("");
    setIsImportModalOpen(false);
  }

  // Il progetto e ciascun task sono creati con le stesse chiamate usate
  // altrove (createProject/createTask): non esiste un endpoint di import
  // massivo lato backend, quindi qui si ricostruisce il progetto un task alla
  // volta. Gli assegnatari del file esportato non vengono ripropagati (vedi
  // projectImport.ts): gli id utente potrebbero non esistere in questa
  // azienda, o appartenere a un'altra.
  async function handleImportProject(data: ParsedProjectImport) {
    try {
      const created = await createProject(data.name);
      let failedTaskCount = 0;
      for (const task of data.tasks) {
        try {
          await createTask(
            created.id,
            task.title,
            task.description,
            task.status,
            task.priority,
            task.dueDate,
          );
        } catch {
          failedTaskCount += 1;
        }
      }
      const imported = (await getProjectById(created.id)) ?? created;
      setProjects((current) =>
        current.some((existing) => existing.id === imported.id)
          ? current.map((existing) => (existing.id === imported.id ? imported : existing))
          : [...current, imported],
      );
      closeImportModal();
      if (failedTaskCount > 0) {
        notifyWarning(
          t("pages.dashboard.importPartialError", { name: data.name, count: failedTaskCount }),
        );
      } else {
        notifySuccess(t("pages.dashboard.importSuccess", { name: data.name }));
      }
    } catch (error) {
      setImportError(
        error instanceof Error ? error.message : t("pages.dashboard.importError"),
      );
    }
  }

  async function handleEditProject(id: string, values: EditProjectFormValues) {
    const updated = await updateProject(id, values);
    setProjects((current) =>
      current.map((project) =>
        project.id === id
          ? { ...project, name: updated.name, customerId: updated.customerId }
          : project,
      ),
    );
  }

  async function handleDeleteProject(id: string) {
    await deleteProject(id);
    setProjects((current) => current.filter((project) => project.id !== id));
  }

  // Indicizzato per id invece di un Array.find ad ogni click: ricalcolato
  // solo quando companyTasks cambia (fetch iniziale), non ad ogni render.
  const companyTasksById = useMemo(
    () => new Map(companyTasks.map((task) => [task.id, task])),
    [companyTasks],
  );

  // TaskCalendarComponent è tipizzato su Task (condiviso con la vista
  // calendario del singolo progetto): il lookup in companyTasksById recupera
  // l'oggetto TaskWithProject completo (projectId/projectName) senza cast.
  function handleOpenTaskDetail(task: Task) {
    const full = companyTasksById.get(task.id);
    if (full) setSelectedTask(full);
  }

  function handleGoToTask(task: TaskWithProject) {
    setSelectedTask(null);
    navigate(`/dashboard/${task.projectId}/task-list?openTask=${task.id}`);
  }

  // Drag & drop di un dot su un altro giorno (vedi onDueDateChange in
  // TaskCalendarComponent): a differenza di taskList.tsx qui il task non
  // porta con sé il projectId (TaskCalendarComponent lavora su Task, non
  // TaskWithProject), quindi va risolto tramite lo stesso lookup di
  // handleOpenTaskDetail prima di poter chiamare updateTask.
  async function handleDueDateChange(task: Task, dueDate: string) {
    const full = companyTasksById.get(task.id);
    if (!full) return;
    try {
      const updatedTask = await updateTask(
        full.projectId,
        task.id,
        task.title,
        task.description,
        dueDate,
      );
      setCompanyTasks((current) =>
        current.map((existing) =>
          existing.id === updatedTask.id ? { ...existing, ...updatedTask } : existing,
        ),
      );
      setCalendarUpdateError("");
    } catch (error) {
      setCalendarUpdateError(
        error instanceof Error ? error.message : t("pages.dashboard.calendarUpdateError"),
      );
    }
  }

  return (
    <Fragment>
      <TopbarComponent onLogout={handleLogout} />
      <div className={styles.dashboardContainer}>
        <header className={styles.dashboardHeader}>
          <div className={styles.dashboardTitleRow}>
            <h1 className={styles.dashboardTitle}>{t("pages.dashboard.title")}</h1>
            {canManage && (
              <button
                type="button"
                className={styles.importButton}
                onClick={openImportModal}
              >
                <Upload size={16} aria-hidden="true" />
                <span>{t("pages.dashboard.importButtonLabel")}</span>
              </button>
            )}
          </div>
        </header>

        {loadError ? (
          <MessageCardComponent
            variant="error"
            role="alert"
            title={t("pages.dashboard.loadErrorTitle")}
            text={loadError}
          />
        ) : !isLoading && projects.length === 0 ? (
          <MessageCardComponent
            title={t("pages.dashboard.emptyTitle")}
            text={t("pages.dashboard.emptyText")}
          />
        ) : !isLoading ? (
          <div className={styles.projectsGrid}>
            {projects.map((project) => (
              <ProjectComponent
                key={project.id}
                {...project}
                canManage={canManage}
                onEditProject={handleEditProject}
                onDeleteProject={handleDeleteProject}
              />
            ))}
          </div>
        ) : null}

        <section className={styles.calendarSection}>
          {calendarLoadError ? (
            <p className={styles.calendarStatus} role="alert">
              {calendarLoadError}
            </p>
          ) : isCalendarLoading ? (
            <p className={styles.calendarStatus} role="status">
              {t("pages.dashboard.calendarLoading")}
            </p>
          ) : (
            <TaskCalendarComponent
              tasks={companyTasks}
              onOpenTask={handleOpenTaskDetail}
              onDueDateChange={handleDueDateChange}
            />
          )}
          {calendarUpdateError && (
            <p role="alert" className={styles.calendarUpdateError}>
              {calendarUpdateError}
            </p>
          )}
        </section>

        <TaskDetailModalComponent
          isOpen={selectedTask !== null}
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onGoToTask={handleGoToTask}
        />

        {canManage && (
          <Fragment>
            <button
              type="button"
              className={styles.fabButton}
              data-assistant-open={isAssistantOpen}
              aria-label={t("pages.dashboard.createButtonLabel")}
              onClick={openCreateModal}
            >
              <Plus className={styles.fabIcon} size={24} strokeWidth={2.5} aria-hidden="true" />
            </button>

            <CreateProjectModalComponent
              isOpen={isCreateModalOpen}
              onClose={closeCreateModal}
              onCreate={handleCreateProject}
              submitError={createError}
            />
            <ImportProjectModalComponent
              isOpen={isImportModalOpen}
              onClose={closeImportModal}
              onImport={handleImportProject}
              submitError={importError}
            />
          </Fragment>
        )}
      </div>
    </Fragment>
  );
}

export default Dashboard;
