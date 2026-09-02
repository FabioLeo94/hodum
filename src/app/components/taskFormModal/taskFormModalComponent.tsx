import { useState } from "react";
import ModalBaseComponent from "../modalBase/modalBaseComponent";
import InputComponent from "../input/inputComponent";
import TextareaComponent from "../textarea/textareaComponent";
import ButtonComponent from "../button/buttonComponent";
import TaskStatusSelectComponent from "../taskStatusSelect/taskStatusSelectComponent";
import PrioritySelectComponent from "../prioritySelect/prioritySelectComponent";
import TaskCommentsPanelComponent from "../taskCommentsPanel/taskCommentsPanelComponent";
import type { TaskStatus } from "../../../shared/types/project";
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
  ) => void | Promise<void>;
  submitError?: string;
  mode?: "create" | "edit";
  initialTitle?: string;
  initialDescription?: string;
  initialDueDate?: string | null;
}

const MODE_COPY = {
  create: {
    title: "Nuovo task",
    description:
      "Dai un titolo al task: la descrizione è facoltativa e potrai aggiornare lo stato in un secondo momento.",
    confirmLabel: "Crea task",
    confirmPendingLabel: "Creazione in corso...",
  },
  edit: {
    title: "Modifica task",
    description: "Aggiorna titolo e descrizione del task.",
    confirmLabel: "Salva modifiche",
    confirmPendingLabel: "Salvataggio in corso...",
  },
} as const;

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
}: Prop) {
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
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const { isSubmitting, submit } = useAsyncSubmit();

  const copy = MODE_COPY[mode];

  const titleError =
    submitAttempted && title.trim() === ""
      ? "Inserisci un titolo per il task."
      : "";

  function handleClose() {
    setTitle("");
    setDescription("");
    setStatus(DEFAULT_STATUS);
    setPriority(DEFAULT_PRIORITY);
    setDueDate("");
    setSubmitAttempted(false);
    onClose();
  }

  async function handleSubmit() {
    setSubmitAttempted(true);
    const trimmedTitle = title.trim();
    if (trimmedTitle === "") return;

    await submit(async () => {
      await onSubmit(trimmedTitle, description.trim(), status, priority, dueDate === "" ? null : dueDate);
      setTitle("");
      setDescription("");
      setStatus(DEFAULT_STATUS);
      setPriority(DEFAULT_PRIORITY);
      setDueDate("");
      setSubmitAttempted(false);
    });
  }

  const formFields = (
    <>
      <p className={styles.description}>{copy.description}</p>
      <InputComponent
        type="text"
        name="taskTitle"
        label="Titolo del task"
        placeholder="Es. Sistemare il bug di login"
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
          label="Descrizione del task"
          placeholder="Es. Il form non valida l'email"
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
          label="Data di scadenza"
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
          showLabel
        />
      </div>
      {mode === "create" && (
        <div className={styles.fieldSpacing}>
          <label className={styles.selectField}>
            <span className={styles.selectLabel}>Stato</span>
            <TaskStatusSelectComponent
              status={status}
              onChange={setStatus}
              taskTitle={title.trim() || "nuovo task"}
            />
          </label>
          <label className={`${styles.selectField} ${styles.fieldSpacing}`}>
            <span className={styles.selectLabel}>Priorità</span>
            <PrioritySelectComponent
              priority={priority}
              onChange={setPriority}
              taskTitle={title.trim() || "nuovo task"}
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
          Annulla
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
