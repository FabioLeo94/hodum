import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
      title={
        isBulk
          ? t("components.deleteBackupModal.titleBulk")
          : t("components.deleteBackupModal.title")
      }
      variant="error"
      onSubmit={handleConfirm}
      primaryAction={
        <ButtonComponent onClick={() => {}} disabled={isSubmitting} variant="danger">
          {isSubmitting
            ? t("components.deleteBackupModal.submitting")
            : isBulk
              ? t("components.deleteBackupModal.confirmBulk", { count })
              : t("components.deleteBackupModal.confirm")}
        </ButtonComponent>
      }
      secondaryActions={
        <button type="button" className={styles.cancelButton} onClick={onClose}>
          {t("components.deleteBackupModal.cancel")}
        </button>
      }
    >
      <p className={styles.description}>
        {isBulk
          ? t("components.deleteBackupModal.bulkWarning", { count })
          : t("components.deleteBackupModal.singleWarning", { filename: backupFilename })}
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
