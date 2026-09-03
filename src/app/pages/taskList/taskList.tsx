import { Fragment, useEffect, useState } from "react";
import type { DragEvent } from "react";
import { useNavigate, useOutletContext, useParams, useSearchParams } from "react-router";
import type { Project, Task, TaskStatus } from "../../../shared/types/project";
import {
  createTask,
  getProjectById,
  updateTask,
  updateTaskAssignees,
  updateTaskPriority,
  updateTaskStatus,
} from "../../services/project/projectService";
import { subscribeToProjectTasks } from "../../services/realtime/socketService";
import { logout, type User } from "../../services/auth/authService";
import { listUsers } from "../../services/user/userService";
import TopbarComponent from "../../components/topbar/topbarComponent";
import TaskFormModalComponent from "../../components/taskFormModal/taskFormModalComponent";
import TaskStatusSelectComponent from "../../components/taskStatusSelect/taskStatusSelectComponent";
import PrioritySelectComponent from "../../components/prioritySelect/prioritySelectComponent";
import TaskAssigneesComponent from "../../components/taskAssignees/taskAssigneesComponent";
import TaskKanbanBoardComponent from "../../components/taskKanbanBoard/taskKanbanBoardComponent";
import TaskCalendarComponent from "../../components/taskCalendar/taskCalendarComponent";
import type { AssistantLayoutContext } from "../../components/protectedLayout/protectedLayoutComponent";
import { usePageMeta } from "../../../shared/hooks/usePageMeta";
import {
  STATUS_ORDER,
  STATUS_GROUP_LABELS,
  groupTasksByStatus,
} from "../../../shared/constants/taskStatus";
import styles from "./taskList.module.css";

// L'ordinamento resta per fascia di stato (raggruppamento consolidato, drag&drop
// incluso): questo controllo riordina solo ALL'INTERNO di ciascun gruppo, non lo
// sostituisce. "none" preserva l'ordine con cui i task arrivano dal backend
// (stabile: Array.prototype.sort non viene nemmeno chiamato in quel caso).
type PrioritySortOrder = "none" | "urgent-first" | "urgent-last";

function sortTasksByPriority(tasks: Task[], order: PrioritySortOrder): Task[] {
  if (order === "none") return tasks;
  const direction = order === "urgent-first" ? 1 : -1;
  return [...tasks].sort((a, b) => (a.priority - b.priority) * direction);
}

type ViewMode = "list" | "kanban" | "calendar";

const VIEW_MODE_KEY = "taskList.viewMode";

// localStorage può non essere disponibile (privacy mode, contesti di test):
// un default sensato (lista) evita che l'assenza del valore salvato rompa
// il rendering.
function readViewModePreference(): ViewMode {
  try {
    const stored = localStorage.getItem(VIEW_MODE_KEY);
    if (stored === "kanban" || stored === "calendar") return stored;
    return "list";
  } catch {
    return "list";
  }
}

const STATUS_STYLES: Record<TaskStatus, string> = {
  progress: styles.groupHeaderProgress,
  review: styles.groupHeaderReview,
  completed: styles.groupHeaderCompleted,
  rejected: styles.groupHeaderRejected,
};

// Condivisa tra il salvataggio di una modifica e il cambio di stato: entrambi
// devono rimpiazzare in place lo stesso task nella lista senza toccare gli altri.
function replaceTaskInProject(project: Project, updatedTask: Task): Project {
  return {
    ...project,
    tasks: project.tasks.map((task) =>
      task.id === updatedTask.id ? updatedTask : task,
    ),
  };
}

// Evita una PUT .../assignees superflua quando il set scelto nella modale
// coincide con quello già salvato (ordine non rilevante, sono id univoci).
function sameAssigneeIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every((id) => setA.has(id));
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

type TaskModalState = { mode: "create" } | { mode: "edit"; task: Task } | null;

// Componente separato, montato con key={progettoId}: un cambio di progetto
// rimonta l'albero invece di richiedere un reset manuale di isLoading/loadError
// nell'effect (pattern richiesto da react-hooks/set-state-in-effect).
function TaskListContent({ progettoId }: TaskListContentProps) {
  const handleLogout = useLogoutHandler();
  // Assente (undefined) quando il componente è renderizzato fuori dal layout
  // protetto (es. nei test): in quel caso il FAB resta nella posizione base.
  const isAssistantOpen =
    useOutletContext<AssistantLayoutContext | undefined>()?.isAssistantOpen ??
    false;
  const [project, setProject] = useState<Project | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [taskModal, setTaskModal] = useState<TaskModalState>(null);
  const [taskModalError, setTaskModalError] = useState("");
  // Condiviso tra cambio stato e cambio priorità: entrambi sono modifiche
  // inline nella stessa riga di tabella, un solo banner d'errore sotto la
  // tabella evita di duplicare lo stesso meccanismo per due campi affini.
  const [inlineUpdateError, setInlineUpdateError] = useState("");
  const [dragOverStatus, setDragOverStatus] = useState<TaskStatus | null>(null);
  const [prioritySort, setPrioritySort] = useState<PrioritySortOrder>("none");
  const [viewMode, setViewMode] = useState<ViewMode>(readViewModePreference);
  // Elenco dei dipendenti della company, per il picker degli assegnatari
  // (card lista/kanban + modale di creazione). Un fallimento qui non deve
  // impedire di vedere i task: resta semplicemente [], il picker degraderà
  // mostrando 0 dipendenti selezionabili.
  const [employees, setEmployees] = useState<User[]>([]);
  // Deep link da una notifica di assegnazione (vedi notificationBellComponent):
  // ?openTask=<id> apre la modale di modifica una volta caricato il progetto.
  const [searchParams, setSearchParams] = useSearchParams();

  usePageMeta({
    title: project ? project.name : "Progetto",
    robots: "noindex, nofollow",
  });

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_MODE_KEY, viewMode);
    } catch {
      // Preferenza non persistita (localStorage non disponibile): resta
      // comunque valida per la sessione corrente in memoria.
    }
  }, [viewMode]);

  useEffect(() => {
    let cancelled = false;

    listUsers()
      .then((data) => {
        if (!cancelled) setEmployees(data);
      })
      .catch((error: unknown) => {
        console.error("Impossibile caricare i dipendenti della company.", error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

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

  // Riflette in tempo reale le modifiche fatte altrove (assistente, un'altra
  // tab/utente): il server notifica solo i client iscritti alla room di
  // questo progetto (vedi subscribeToProjectTasks), quindi qui basta
  // applicare il delta allo stato locale invece di rifare un fetch completo.
  useEffect(() => {
    const unsubscribe = subscribeToProjectTasks(progettoId, {
      onTaskCreated: (task) => {
        setProject((current) => {
          if (!current || current.tasks.some((existing) => existing.id === task.id)) {
            return current;
          }
          return { ...current, tasks: [...current.tasks, task] };
        });
      },
      onTaskUpdated: (task) => {
        setProject((current) => (current ? replaceTaskInProject(current, task) : current));
      },
      onTaskDeleted: (taskId) => {
        setProject((current) =>
          current ? { ...current, tasks: current.tasks.filter((task) => task.id !== taskId) } : current,
        );
      },
      onResync: () => {
        getProjectById(progettoId)
          .then((data) => {
            if (data) setProject(data);
          })
          .catch(() => {
            // Un fallimento del resync lascia lo stato precedente: al
            // prossimo evento in arrivo (o refresh manuale) si riallinea.
          });
      },
    });

    return unsubscribe;
  }, [progettoId]);

  // Il task potrebbe essere stato eliminato tra l'invio della notifica e il
  // click: in quel caso semplicemente non compare tra i tasks del progetto e
  // la modale non si apre, invece di puntare a un link rotto.
  useEffect(() => {
    const openTaskId = searchParams.get("openTask");
    if (!openTaskId || !project) return;
    const task = project.tasks.find((candidate) => candidate.id === openTaskId);
    if (task) {
      openEditModal(task);
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("openTask");
        return next;
      },
      { replace: true },
    );
  }, [project, searchParams, setSearchParams]);

  function openCreateModal() {
    setTaskModalError("");
    setTaskModal({ mode: "create" });
  }

  function openEditModal(task: Task) {
    setTaskModalError("");
    setTaskModal({ mode: "edit", task });
  }

  function closeTaskModal() {
    setTaskModalError("");
    setTaskModal(null);
  }

  async function handleTaskFormSubmit(
    title: string,
    description: string,
    status: TaskStatus,
    priority: number,
    dueDate: string | null,
    assigneeIds?: string[],
  ) {
    try {
      const editingTask = taskModal?.mode === "edit" ? taskModal.task : null;
      let savedTask = editingTask
        ? await updateTask(progettoId, editingTask.id, title, description, dueDate)
        : await createTask(progettoId, title, description, status, priority, dueDate, assigneeIds);

      // In edit mode gli assegnatari passano da un endpoint separato (stesso
      // motivo di handleAssigneesChange sotto): updateTask non li accetta,
      // quindi qui va replicato l'aggiornamento, ma solo se la modale li ha
      // davvero modificati rispetto a quelli già salvati.
      if (
        editingTask &&
        assigneeIds &&
        !sameAssigneeIds(assigneeIds, editingTask.assignees.map((assignee) => assignee.id))
      ) {
        savedTask = await updateTaskAssignees(progettoId, editingTask.id, assigneeIds);
      }

      setProject((current) => {
        if (!current) return current;
        if (editingTask) {
          return replaceTaskInProject(current, savedTask);
        }
        // Il socket (già iscritto alla room, vedi subscribeToProjectTasks) può
        // notificare task:created prima che questa promise si risolva: senza
        // questo controllo il task finirebbe aggiunto due volte.
        return current.tasks.some((task) => task.id === savedTask.id)
          ? current
          : { ...current, tasks: [...current.tasks, savedTask] };
      });
      closeTaskModal();
    } catch (error) {
      setTaskModalError(
        error instanceof Error ? error.message : "Impossibile salvare il task.",
      );
    }
  }

  async function handleStatusChange(taskId: string, status: TaskStatus) {
    try {
      const updatedTask = await updateTaskStatus(progettoId, taskId, status);
      setProject((current) =>
        current ? replaceTaskInProject(current, updatedTask) : current,
      );
      setInlineUpdateError("");
    } catch (error) {
      setInlineUpdateError(
        error instanceof Error
          ? error.message
          : "Impossibile aggiornare lo stato del task.",
      );
    }
  }

  async function handlePriorityChange(taskId: string, priority: number) {
    try {
      const updatedTask = await updateTaskPriority(progettoId, taskId, priority);
      setProject((current) =>
        current ? replaceTaskInProject(current, updatedTask) : current,
      );
      setInlineUpdateError("");
    } catch (error) {
      setInlineUpdateError(
        error instanceof Error
          ? error.message
          : "Impossibile aggiornare la priorità del task.",
      );
    }
  }

  async function handleAssigneesChange(taskId: string, userIds: string[]) {
    try {
      const updatedTask = await updateTaskAssignees(progettoId, taskId, userIds);
      setProject((current) =>
        current ? replaceTaskInProject(current, updatedTask) : current,
      );
      setInlineUpdateError("");
    } catch (error) {
      setInlineUpdateError(
        error instanceof Error
          ? error.message
          : "Impossibile aggiornare gli assegnatari del task.",
      );
    }
  }

  if (isLoading) {
    return (
      <Fragment>
        <TopbarComponent onLogout={handleLogout} />
        <div className={styles.taskListContainer}>
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

  // Copia locale con tipo già ristretto a Project: essendo hoisted, le function
  // declaration definite più sotto sono considerate chiamabili da qualunque punto
  // del flusso, quindi TS non propaga al loro interno il narrowing di `if (!project) return`.
  const currentProject = project;
  const groupedTasks = groupTasksByStatus(currentProject.tasks);
  const editingTask = taskModal?.mode === "edit" ? taskModal.task : null;
  const taskModalKey =
    taskModal === null ? "closed" : editingTask ? `edit-${editingTask.id}` : "create";

  function handleDragStart(event: DragEvent<HTMLTableRowElement>, taskId: string) {
    event.dataTransfer.setData("text/plain", taskId);
    event.dataTransfer.effectAllowed = "move";
  }

  function handleGroupDragOver(
    event: DragEvent<HTMLTableSectionElement>,
    status: TaskStatus,
  ) {
    event.preventDefault();
    setDragOverStatus(status);
  }

  function handleGroupDragLeave() {
    setDragOverStatus(null);
  }

  function handleGroupDrop(
    event: DragEvent<HTMLTableSectionElement>,
    status: TaskStatus,
  ) {
    event.preventDefault();
    setDragOverStatus(null);
    const taskId = event.dataTransfer.getData("text/plain");
    const task = currentProject.tasks.find((candidate) => candidate.id === taskId);
    if (task && task.status !== status) {
      handleStatusChange(taskId, status);
    }
  }

  return (
    <Fragment>
      <TopbarComponent onLogout={handleLogout} />
      <div className={styles.taskListContainer}>
        <header className={styles.taskListHeader}>
          <h1 className={styles.taskListTitle}>{project.name}</h1>
          <div className={styles.headerControls}>
            {viewMode === "list" && (
              <label className={styles.sortControl}>
                <span className={styles.sortLabel}>Ordina per priorità</span>
                <select
                  className={styles.sortSelect}
                  value={prioritySort}
                  onChange={(event) =>
                    setPrioritySort(event.target.value as PrioritySortOrder)
                  }
                >
                  <option value="none">Nessun ordinamento</option>
                  <option value="urgent-first">Più urgenti prima</option>
                  <option value="urgent-last">Meno urgenti prima</option>
                </select>
              </label>
            )}
            <div className={styles.viewSwitch} role="group" aria-label="Modalità di visualizzazione">
              <button
                type="button"
                className={styles.viewSwitchButton}
                aria-pressed={viewMode === "list"}
                onClick={() => setViewMode("list")}
              >
                Lista
              </button>
              <button
                type="button"
                className={styles.viewSwitchButton}
                aria-pressed={viewMode === "kanban"}
                onClick={() => setViewMode("kanban")}
              >
                Kanban
              </button>
              <button
                type="button"
                className={styles.viewSwitchButton}
                aria-pressed={viewMode === "calendar"}
                onClick={() => setViewMode("calendar")}
              >
                Calendario
              </button>
            </div>
          </div>
        </header>
        {viewMode === "kanban" ? (
          <TaskKanbanBoardComponent
            groupedTasks={groupedTasks}
            onStatusChange={handleStatusChange}
            onPriorityChange={handlePriorityChange}
            onOpenTask={openEditModal}
            employees={employees}
            onAssigneesChange={handleAssigneesChange}
          />
        ) : viewMode === "calendar" ? (
          <TaskCalendarComponent tasks={currentProject.tasks} onOpenTask={openEditModal} />
        ) : (
          <div className={styles.taskTableCard}>
            <table className={styles.taskTable}>
              <caption className={styles.srOnly}>
                Task del progetto {project.name}, raggruppati per stato
              </caption>
              <thead>
                <tr>
                  <th className={styles.colTitle} scope="col">
                    Titolo
                  </th>
                  <th className={styles.colDescription} scope="col">
                    Descrizione
                  </th>
                  <th className={styles.colStatus} scope="col">
                    Stato
                  </th>
                  <th className={styles.colPriority} scope="col">
                    Priorità
                  </th>
                  <th className={styles.colAssignees} scope="col">
                    Assegnatari
                  </th>
                </tr>
              </thead>
              {STATUS_ORDER.map((status) => {
                const tasks = sortTasksByPriority(groupedTasks[status], prioritySort);
                return (
                  <tbody
                    key={status}
                    className={
                      dragOverStatus === status ? styles.dragOverGroup : undefined
                    }
                    onDragOver={(event) => handleGroupDragOver(event, status)}
                    onDragLeave={handleGroupDragLeave}
                    onDrop={(event) => handleGroupDrop(event, status)}
                  >
                    <tr>
                      <th
                        className={`${styles.groupHeaderCell} ${STATUS_STYLES[status]}`}
                        colSpan={5}
                        scope="colgroup"
                      >
                        {STATUS_GROUP_LABELS[status]} ({tasks.length})
                      </th>
                    </tr>
                    {tasks.length === 0 ? (
                      <tr>
                        <td
                          className={styles.emptyRow}
                          data-drop-target={dragOverStatus === status}
                          colSpan={5}
                        >
                          {dragOverStatus === status
                            ? "Rilascia qui per spostare il task"
                            : "Nessun task"}
                        </td>
                      </tr>
                    ) : (
                      tasks.map((task) => (
                        <tr
                          key={task.id}
                          className={styles.taskRow}
                          draggable
                          onDragStart={(event) => handleDragStart(event, task.id)}
                          onDragEnd={handleGroupDragLeave}
                        >
                          <td>
                            <div className={styles.titleCell}>
                              <span
                                className={styles.dragHandle}
                                aria-hidden="true"
                                title="Trascina per cambiare stato"
                              >
                                <svg
                                  width="10"
                                  height="16"
                                  viewBox="0 0 10 16"
                                  fill="currentColor"
                                >
                                  <circle cx="2" cy="2" r="1.5" />
                                  <circle cx="8" cy="2" r="1.5" />
                                  <circle cx="2" cy="8" r="1.5" />
                                  <circle cx="8" cy="8" r="1.5" />
                                  <circle cx="2" cy="14" r="1.5" />
                                  <circle cx="8" cy="14" r="1.5" />
                                </svg>
                              </span>
                              <button
                                type="button"
                                className={styles.taskTitleButton}
                                title={task.title}
                                onClick={() => openEditModal(task)}
                              >
                                {task.title}
                              </button>
                            </div>
                          </td>
                          <td className={styles.descriptionCell} title={task.description}>
                            {task.description}
                          </td>
                          <td>
                            <TaskStatusSelectComponent
                              status={task.status}
                              taskTitle={task.title}
                              onChange={(newStatus) =>
                                handleStatusChange(task.id, newStatus)
                              }
                            />
                          </td>
                          <td>
                            <PrioritySelectComponent
                              priority={task.priority}
                              taskTitle={task.title}
                              onChange={(newPriority) =>
                                handlePriorityChange(task.id, newPriority)
                              }
                            />
                          </td>
                          <td>
                            <TaskAssigneesComponent
                              employees={employees}
                              selectedIds={task.assignees.map((assignee) => assignee.id)}
                              taskTitle={task.title}
                              onChange={(userIds) => handleAssigneesChange(task.id, userIds)}
                            />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                );
              })}
            </table>
          </div>
        )}
        {inlineUpdateError && (
          <p role="alert" className={styles.statusUpdateError}>
            {inlineUpdateError}
          </p>
        )}

        <button
          type="button"
          className={styles.fabButton}
          data-assistant-open={isAssistantOpen}
          aria-label="Crea nuovo task"
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

        <TaskFormModalComponent
          // Rimonta ad ogni apertura (chiusa -> creazione -> modifica di un
          // task specifico): TaskFormModalComponent legge initialTitle/
          // initialDescription solo al mount, quindi serve un'istanza nuova
          // per precompilare correttamente i campi in edit.
          key={taskModalKey}
          isOpen={taskModal !== null}
          projectId={progettoId}
          taskId={editingTask?.id}
          mode={taskModal?.mode ?? "create"}
          initialTitle={editingTask?.title}
          initialDescription={editingTask?.description}
          initialDueDate={editingTask?.dueDate}
          initialAssigneeIds={editingTask?.assignees.map((assignee) => assignee.id)}
          onClose={closeTaskModal}
          onSubmit={handleTaskFormSubmit}
          submitError={taskModalError}
          employees={employees}
        />
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
