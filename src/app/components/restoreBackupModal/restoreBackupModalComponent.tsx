import ModalBaseComponent from "../modalBase/modalBaseComponent";
import ButtonComponent from "../button/buttonComponent";
import { useAsyncSubmit } from "../../../shared/hooks/useAsyncSubmit";
import styles from "./restoreBackupModalComponent.module.css";

interface Prop {
  isOpen: boolean;
  onClose: () => void;
  backupFilename: string;
  onConfirm: () => void | Promise<void>;
  submitError?: string;
}

function RestoreBackupModalComponent({
  isOpen,
  onClose,
  backupFilename,
  onConfirm,
  submitError,
}: Prop) {
  const { isSubmitting, submit } = useAsyncSubmit();

  async function handleConfirm() {
    await submit(async () => {
      await onConfirm();
    });
  }

  return (
    <ModalBaseComponent
      isOpen={isOpen}
      onClose={onClose}
      title="Applica backup"
      variant="error"
      onSubmit={handleConfirm}
      primaryAction={
        <ButtonComponent onClick={() => {}} disabled={isSubmitting} variant="danger">
          {isSubmitting ? "Ripristino in corso..." : "Applica"}
        </ButtonComponent>
      }
      secondaryActions={
        <button type="button" className={styles.cancelButton} onClick={onClose}>
          Annulla
        </button>
      }
    >
      <p className={styles.description}>
        Stai per sovrascrivere i dati attuali dell'azienda con «{backupFilename}
        ». Tutti i cambiamenti fatti dopo quel backup andranno persi.
      </p>
      <p className={styles.description}>
        Prima di procedere verrà comunque salvato automaticamente uno snapshot
        dello stato attuale, che troverai nello storico e potrai applicare per
        annullare il ripristino.
      </p>
      {submitError && (
        <p role="alert" className={styles.submitError}>
          {submitError}
        </p>
      )}
    </ModalBaseComponent>
  );
}

export default RestoreBackupModalComponent;
