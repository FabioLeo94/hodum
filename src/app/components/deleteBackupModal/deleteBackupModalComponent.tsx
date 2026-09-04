import ModalBaseComponent from "../modalBase/modalBaseComponent";
import ButtonComponent from "../button/buttonComponent";
import { useAsyncSubmit } from "../../../shared/hooks/useAsyncSubmit";
import styles from "./deleteBackupModalComponent.module.css";

interface Prop {
  isOpen: boolean;
  onClose: () => void;
  backupFilename: string;
  // Presente solo per l'eliminazione in blocco (selezione multipla nello
  // storico): quando > 1 il testo della modale mostra il conteggio invece
  // del nome del singolo file, che in quel caso non è significativo.
  count?: number;
  onConfirm: () => void | Promise<void>;
  submitError?: string;
}

function DeleteBackupModalComponent({
  isOpen,
  onClose,
  backupFilename,
  count,
  onConfirm,
  submitError,
}: Prop) {
  const { isSubmitting, submit } = useAsyncSubmit();
  const isBulk = (count ?? 0) > 1;

  async function handleConfirm() {
    await submit(async () => {
      await onConfirm();
    });
  }

  return (
    <ModalBaseComponent
      isOpen={isOpen}
      onClose={onClose}
      title={isBulk ? "Elimina backup selezionati" : "Elimina backup"}
      variant="error"
      onSubmit={handleConfirm}
      primaryAction={
        <ButtonComponent onClick={() => {}} disabled={isSubmitting} variant="danger">
          {isSubmitting ? "Eliminazione in corso..." : isBulk ? `Elimina ${count}` : "Elimina"}
        </ButtonComponent>
      }
      secondaryActions={
        <button type="button" className={styles.cancelButton} onClick={onClose}>
          Annulla
        </button>
      }
    >
      <p className={styles.description}>
        {isBulk
          ? `Stai per eliminare ${count} backup selezionati. L'operazione non è reversibile.`
          : `Stai per eliminare «${backupFilename}». L'operazione non è reversibile.`}
      </p>
      {submitError && (
        <p role="alert" className={styles.submitError}>
          {submitError}
        </p>
      )}
    </ModalBaseComponent>
  );
}

export default DeleteBackupModalComponent;
