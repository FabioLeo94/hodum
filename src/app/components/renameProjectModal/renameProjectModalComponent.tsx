import { useState } from "react";
import ModalBaseComponent from "../modalBase/modalBaseComponent";
import InputComponent from "../input/inputComponent";
import ButtonComponent from "../button/buttonComponent";
import styles from "./renameProjectModalComponent.module.css";

interface Prop {
  isOpen: boolean;
  onClose: () => void;
  currentName: string;
  onRename: (name: string) => void | Promise<void>;
  submitError?: string;
}

function RenameProjectModalComponent({
  isOpen,
  onClose,
  currentName,
  onRename,
  submitError,
}: Prop) {
  // Precompilato solo al mount di questa istanza: il chiamante rimonta il
  // componente (via `key`) ogni volta che la modale si riapre, così il valore
  // iniziale è sempre il nome corrente senza un effect di risincronizzazione.
  const [name, setName] = useState(currentName);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const nameError =
    submitAttempted && name.trim() === ""
      ? "Inserisci un nome per il progetto."
      : "";

  function handleClose() {
    setSubmitAttempted(false);
    onClose();
  }

  async function handleRename() {
    if (isSubmitting) return;
    setSubmitAttempted(true);
    const trimmedName = name.trim();
    if (trimmedName === "") return;

    setIsSubmitting(true);
    try {
      await onRename(trimmedName);
      setSubmitAttempted(false);
    } catch {
      // onRename è responsabile di segnalare l'errore tramite submitError;
      // qui si intercetta solo per evitare una unhandled rejection e permettere il retry.
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ModalBaseComponent
      isOpen={isOpen}
      onClose={handleClose}
      title="Rinomina progetto"
      onSubmit={handleRename}
      primaryAction={
        <ButtonComponent onClick={() => {}} disabled={isSubmitting}>
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

export default RenameProjectModalComponent;
