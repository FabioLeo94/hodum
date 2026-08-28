import { useState } from "react";
import ModalBaseComponent from "../modalBase/modalBaseComponent";
import InputComponent from "../input/inputComponent";
import ButtonComponent from "../button/buttonComponent";
import styles from "./createProjectModalComponent.module.css";

interface Prop {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string) => void | Promise<void>;
  submitError?: string;
}

function CreateProjectModalComponent({
  isOpen,
  onClose,
  onCreate,
  submitError,
}: Prop) {
  const [name, setName] = useState("");
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const nameError =
    submitAttempted && name.trim() === ""
      ? "Inserisci un nome per il progetto."
      : "";

  function handleClose() {
    setName("");
    setSubmitAttempted(false);
    onClose();
  }

  async function handleCreate() {
    if (isSubmitting) return;
    setSubmitAttempted(true);
    const trimmedName = name.trim();
    if (trimmedName === "") return;

    setIsSubmitting(true);
    try {
      await onCreate(trimmedName);
      setName("");
      setSubmitAttempted(false);
    } catch {
      // onCreate è responsabile di segnalare l'errore tramite submitError;
      // qui si intercetta solo per evitare una unhandled rejection e permettere il retry.
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ModalBaseComponent
      isOpen={isOpen}
      onClose={handleClose}
      title="Nuovo progetto"
      onSubmit={handleCreate}
      primaryAction={
        <ButtonComponent onClick={() => {}} disabled={isSubmitting}>
          {isSubmitting ? "Creazione in corso..." : "Crea progetto"}
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
      <p className={styles.description}>
        Dai un nome al progetto: potrai aggiungere i task in un secondo
        momento, dalla sua pagina dedicata.
      </p>
      <InputComponent
        type="text"
        name="projectName"
        label="Nome del progetto"
        placeholder="Es. Redesign sito web"
        value={name}
        onChange={(event) => setName(event.target.value)}
        autoComplete="off"
        autoFocus
        error={nameError}
      />
      {submitError && (
        <p role="alert" className={styles.submitError}>
          {submitError}
        </p>
      )}
    </ModalBaseComponent>
  );
}

export default CreateProjectModalComponent;
