import { useTranslation } from "react-i18next";
import ModalBaseComponent from "../modalBase/modalBaseComponent";
import ButtonComponent from "../button/buttonComponent";
import { useAsyncSubmit } from "../../../shared/hooks/useAsyncSubmit";
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
      title={t("components.deleteProjectModal.title")}
      variant="error"
      onSubmit={handleConfirm}
      primaryAction={
        <ButtonComponent
          onClick={() => {}}
          disabled={isSubmitting}
          variant="danger"
        >
          {isSubmitting
            ? t("components.deleteProjectModal.submitting")
            : t("components.deleteProjectModal.submit")}
        </ButtonComponent>
      }
      secondaryActions={
        <button
          type="button"
          className={styles.cancelButton}
          onClick={onClose}
        >
          {t("components.deleteProjectModal.cancel")}
        </button>
      }
    >
      <p className={styles.description}>
        {t("components.deleteProjectModal.description", { projectName })}
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
