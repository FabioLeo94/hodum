import { useState } from "react";
import ModalBaseComponent from "../modalBase/modalBaseComponent";
import InputComponent from "../input/inputComponent";
import ButtonComponent from "../button/buttonComponent";
import styles from "./taskFormModalComponent.module.css";

interface Prop {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (title: string, description: string) => void | Promise<void>;
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
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const copy = MODE_COPY[mode];

  const titleError =
    submitAttempted && title.trim() === ""
      ? "Inserisci un titolo per il task."
      : "";

  function handleClose() {
    setTitle("");
    setDescription("");
    setSubmitAttempted(false);
    onClose();
  }

  async function handleSubmit() {
    if (isSubmitting) return;
    setSubmitAttempted(true);
    const trimmedTitle = title.trim();
    if (trimmedTitle === "") return;

    setIsSubmitting(true);
    try {
      await onSubmit(trimmedTitle, description.trim());
      setTitle("");
      setDescription("");
      setSubmitAttempted(false);
    } catch {
      // onSubmit è responsabile di segnalare l'errore tramite submitError;
      // qui si intercetta solo per evitare una unhandled rejection e permettere il retry.
    } finally {
      setIsSubmitting(false);
    }
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
        <InputComponent
          type="text"
          name="taskDescription"
          label="Descrizione del task"
          placeholder="Es. Il form non valida l'email"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          autoComplete="off"
        />
      </div>
      {submitError && (
        <p role="alert" className={styles.submitError}>
          {submitError}
        </p>
      )}
    </ModalBaseComponent>
  );
}

export default TaskFormModalComponent;
