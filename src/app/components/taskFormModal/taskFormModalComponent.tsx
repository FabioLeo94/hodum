import { useState } from "react";
import { useTranslation } from "react-i18next";
import ModalBaseComponent from "../modalBase/modalBaseComponent";
import InputComponent from "../input/inputComponent";
import TextareaComponent from "../textarea/textareaComponent";
import ButtonComponent from "../button/buttonComponent";
import TaskStatusSelectComponent from "../taskStatusSelect/taskStatusSelectComponent";
import PrioritySelectComponent from "../prioritySelect/prioritySelectComponent";
import TaskCommentsPanelComponent from "../taskCommentsPanel/taskCommentsPanelComponent";
import TaskAssigneesComponent from "../taskAssignees/taskAssigneesComponent";
import type { TaskStatus } from "../../../shared/types/project";
import type { User } from "../../services/auth/authService";
import { useAsyncSubmit } from "../../../shared/hooks/useAsyncSubmit";
import styles from "./taskFormModalComponent.module.css";

const DEFAULT_STATUS: TaskStatus = "progress";
const DEFAULT_PRIORITY = 5;

interface Prop {
  isOpen: boolean;
  projectId: string;
  // Presente solo in modalità "edit" (il task non esiste ancora in "create"):
  // determina anche se il pannello commenti viene mostrato.
  taskId?: string;
  onClose: () => void;
  onSubmit: (
    title: string,
    description: string,
    status: TaskStatus,
    priority: number,
    dueDate: string | null,
    assigneeIds?: string[],
  ) => void | Promise<void>;
  submitError?: string;
  mode?: "create" | "edit";
  initialTitle?: string;
  initialDescription?: string;
  initialDueDate?: string | null;
  initialAssigneeIds?: string[];
  employees: User[];
}

function TaskFormModalComponent({
  isOpen,
  projectId,
  taskId,
  onClose,
  onSubmit,
  submitError,
  mode = "create",
  initialTitle,
  initialDescription,
  initialDueDate,
  initialAssigneeIds,
  employees,
}: Prop) {
  const { t } = useTranslation();
  const MODE_COPY = {
    create: {
      title: t("components.taskFormModal.create.title"),
      description: t("components.taskFormModal.create.description"),
      confirmLabel: t("components.taskFormModal.create.confirmLabel"),
      confirmPendingLabel: t("components.taskFormModal.create.confirmPendingLabel"),
    },
    edit: {
      title: t("components.taskFormModal.edit.title"),
      description: t("components.taskFormModal.edit.description"),
      confirmLabel: t("components.taskFormModal.edit.confirmLabel"),
      confirmPendingLabel: t("components.taskFormModal.edit.confirmPendingLabel"),
    },
  } as const;
  // Inizializzati solo al mount di questa istanza: il chiamante è responsabile
  // di rimontare il componente (via `key`) ogni volta che la modale si riapre,
  // così i valori iniziali di edit sono sempre quelli correnti senza bisogno di
  // un effect che li risincronizzi (che innescherebbe un setState sincrono in
  // effect, oltre a un giro di render in più).
  const [title, setTitle] = useState(initialTitle ?? "");
  const [description, setDescription] = useState(initialDescription ?? "");
  const [status, setStatus] = useState<TaskStatus>(DEFAULT_STATUS);
  const [priority, setPriority] = useState(DEFAULT_PRIORITY);
  // Stringa vuota rappresenta "nessuna scadenza" nell'input HTML nativo
  // type="date": normalizzata a null solo al submit (vedi handleSubmit).
  const [dueDate, setDueDate] = useState(initialDueDate ?? "");
  const [assigneeIds, setAssigneeIds] = useState<string[]>(initialAssigneeIds ?? []);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const { isSubmitting, submit } = useAsyncSubmit();

  const copy = MODE_COPY[mode];

  const titleError =
    submitAttempted && title.trim() === ""
      ? t("components.taskFormModal.titleRequired")
      : "";

  function handleClose() {
    setTitle("");
    setDescription("");
    setStatus(DEFAULT_STATUS);
    setPriority(DEFAULT_PRIORITY);
    setDueDate("");
    setAssigneeIds([]);
    setSubmitAttempted(false);
    onClose();
  }

  async function handleSubmit() {
    setSubmitAttempted(true);
    const trimmedTitle = title.trim();
    if (trimmedTitle === "") return;

    await submit(async () => {
      await onSubmit(
        trimmedTitle,
        description.trim(),
        status,
        priority,
        dueDate === "" ? null : dueDate,
        assigneeIds,
      );
      setTitle("");
      setDescription("");
      setStatus(DEFAULT_STATUS);
      setPriority(DEFAULT_PRIORITY);
      setDueDate("");
      setAssigneeIds([]);
      setSubmitAttempted(false);
    });
  }

  const formFields = (
    <>
      <p className={styles.description}>{copy.description}</p>
      <InputComponent
        type="text"
        name="taskTitle"
        label={t("components.taskFormModal.titleLabel")}
        placeholder={t("components.taskFormModal.titlePlaceholder")}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        autoComplete="off"
        autoFocus
        error={titleError}
        showLabel
      />
      {/* In edit mode la descrizione riempie lo spazio verticale disponibile
          fra titolo e data (fillHeight): ha senso solo lì, dove il form
          condivide l'altezza fissa della colonna commenti accanto (vedi
          .editLayout/.formColumn in taskFormModalComponent.module.css). In
          create mode non c'è un'altezza di riferimento, resta a rows fisse. */}
      <div className={mode === "edit" ? styles.fieldSpacingFill : styles.fieldSpacing}>
        <TextareaComponent
          name="taskDescription"
          label={t("components.taskFormModal.descriptionLabel")}
          placeholder={t("components.taskFormModal.descriptionPlaceholder")}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          autoComplete="off"
          rows={4}
          showLabel
          fillHeight={mode === "edit"}
        />
      </div>
      <div className={styles.fieldSpacing}>
        <InputComponent
          type="date"
          name="taskDueDate"
          label={t("components.taskFormModal.dueDateLabel")}
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
          showLabel
        />
      </div>
      <div className={`${styles.fieldSpacing} ${styles.assigneesField}`}>
        <span className={styles.selectLabel}>{t("components.taskFormModal.assigneesLabel")}</span>
        <TaskAssigneesComponent
          employees={employees}
          selectedIds={assigneeIds}
          taskTitle={title.trim() || t("components.taskFormModal.untitledTaskFallback")}
          onChange={setAssigneeIds}
        />
      </div>
      {mode === "create" && (
        <div className={styles.fieldSpacing}>
          <label className={styles.selectField}>
            <span className={styles.selectLabel}>{t("components.taskFormModal.statusLabel")}</span>
            <TaskStatusSelectComponent
              status={status}
              onChange={setStatus}
              taskTitle={title.trim() || t("components.taskFormModal.untitledTaskFallback")}
            />
          </label>
          <label className={`${styles.selectField} ${styles.fieldSpacing}`}>
            <span className={styles.selectLabel}>{t("components.taskFormModal.priorityLabel")}</span>
            <PrioritySelectComponent
              priority={priority}
              onChange={setPriority}
              taskTitle={title.trim() || t("components.taskFormModal.untitledTaskFallback")}
            />
          </label>
        </div>
      )}
      {submitError && (
        <p role="alert" className={styles.submitError}>
          {submitError}
        </p>
      )}
    </>
  );

  return (
    <ModalBaseComponent
      isOpen={isOpen}
      onClose={handleClose}
      title={copy.title}
      size={mode === "edit" ? "wide" : "default"}
      onSubmit={handleSubmit}
      primaryAction={
        <ButtonComponent onClick={() => {}} disabled={isSubmitting}>
          {isSubmitting ? copy.confirmPendingLabel : copy.confirmLabel}
        </ButtonComponent>
      }
      secondaryActions={
        <button
          type="button"
          className={styles.cancelButton}
          onClick={handleClose}
        >
          {t("components.taskFormModal.cancel")}
        </button>
      }
    >
      {/* In create mode il task non esiste ancora e non ha commenti: colonna
          singola, nessun pannello. taskId è opzionale solo per questo. */}
      {mode === "edit" && taskId !== undefined ? (
        <div className={styles.editLayout}>
          <div className={styles.formColumn}>{formFields}</div>
          <div className={styles.commentsColumn}>
            <TaskCommentsPanelComponent projectId={projectId} taskId={taskId} />
          </div>
        </div>
      ) : (
        formFields
      )}
    </ModalBaseComponent>
  );
}

export default TaskFormModalComponent;
