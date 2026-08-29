import { useState } from "react";
import ModalBaseComponent from "../modalBase/modalBaseComponent";
import ButtonComponent from "../button/buttonComponent";
import styles from "./deleteProjectModalComponent.module.css";

interface Prop {
  isOpen: boolean;
  onClose: () => void;
  projectName: string;
  onConfirm: () => void | Promise<void>;
  submitError?: string;
}

function DeleteProjectModalComponent({
  isOpen,
  onClose,
  projectName,
  onConfirm,
  submitError,
}: Prop) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleConfirm() {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onConfirm();
    } catch {
      // onConfirm è responsabile di segnalare l'errore tramite submitError;
      // qui si intercetta solo per evitare una unhandled rejection e permettere il retry.
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ModalBaseComponent
      isOpen={isOpen}
      onClose={onClose}
      title="Elimina progetto"
      variant="error"
      onSubmit={handleConfirm}
      primaryAction={
        <ButtonComponent
          onClick={() => {}}
          disabled={isSubmitting}
          variant="danger"
        >
          {isSubmitting ? "Eliminazione in corso..." : "Elimina"}
        </ButtonComponent>
      }
      secondaryActions={
        <button
          type="button"
          className={styles.cancelButton}
          onClick={onClose}
        >
          Annulla
        </button>
      }
    >
      <p className={styles.description}>
        Stai per eliminare «{projectName}». L'operazione non è reversibile.
      </p>
      {submitError && (
        <p role="alert" className={styles.submitError}>
          {submitError}
        </p>
      )}
    </ModalBaseComponent>
  );
}

export default DeleteProjectModalComponent;
