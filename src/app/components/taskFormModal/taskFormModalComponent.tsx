import { useState } from "react";
import ModalBaseComponent from "../modalBase/modalBaseComponent";
import InputComponent from "../input/inputComponent";
import TextareaComponent from "../textarea/textareaComponent";
import ButtonComponent from "../button/buttonComponent";
import TaskStatusSelectComponent from "../taskStatusSelect/taskStatusSelectComponent";
import PrioritySelectComponent from "../prioritySelect/prioritySelectComponent";
import type { TaskStatus } from "../../../shared/types/project";
import { useAsyncSubmit } from "../../../shared/hooks/useAsyncSubmit";
import styles from "./taskFormModalComponent.module.css";

const DEFAULT_STATUS: TaskStatus = "progress";
const DEFAULT_PRIORITY = 5;

interface Prop {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (
    title: string,
    description: string,
    status: TaskStatus,
    priority: number,
  ) => void | Promise<void>;
  submitError?: string;
  mode?: "create" | "edit";
  initialTitle?: string;
  initialDescription?: string;
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
  onClose,
  onSubmit,
  submitError,
  mode = "create",
  initialTitle,
  initialDescription,
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
    setSubmitAttempted(false);
    onClose();
  }

  async function handleSubmit() {
    setSubmitAttempted(true);
    const trimmedTitle = title.trim();
    if (trimmedTitle === "") return;

    await submit(async () => {
      await onSubmit(trimmedTitle, description.trim(), status, priority);
      setTitle("");
      setDescription("");
      setStatus(DEFAULT_STATUS);
      setPriority(DEFAULT_PRIORITY);
      setSubmitAttempted(false);
    });
  }

  return (
    <ModalBaseComponent
      isOpen={isOpen}
      onClose={handleClose}
      title={copy.title}
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
      />
      <div className={styles.fieldSpacing}>
        <TextareaComponent
          name="taskDescription"
          label="Descrizione del task"
          placeholder="Es. Il form non valida l'email"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          autoComplete="off"
          rows={4}
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
    </ModalBaseComponent>
  );
}

export default TaskFormModalComponent;
