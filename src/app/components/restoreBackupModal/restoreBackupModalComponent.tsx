import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
      title={t("components.restoreBackupModal.title")}
      variant="error"
      onSubmit={handleConfirm}
      primaryAction={
        <ButtonComponent onClick={() => {}} disabled={isSubmitting} variant="danger">
          {isSubmitting
            ? t("components.restoreBackupModal.submitting")
            : t("components.restoreBackupModal.confirm")}
        </ButtonComponent>
      }
      secondaryActions={
        <button type="button" className={styles.cancelButton} onClick={onClose}>
          {t("components.restoreBackupModal.cancel")}
        </button>
      }
    >
      <p className={styles.description}>
        {t("components.restoreBackupModal.overwriteWarning", { filename: backupFilename })}
      </p>
      <p className={styles.description}>{t("components.restoreBackupModal.snapshotNotice")}</p>
      {submitError && (
        <p role="alert" className={styles.submitError}>
          {submitError}
        </p>
      )}
    </ModalBaseComponent>
  );
}

export default RestoreBackupModalComponent;
