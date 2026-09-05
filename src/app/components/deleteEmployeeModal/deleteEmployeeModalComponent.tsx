import { useTranslation } from "react-i18next";
import ModalBaseComponent from "../modalBase/modalBaseComponent";
import ButtonComponent from "../button/buttonComponent";
import { useAsyncSubmit } from "../../../shared/hooks/useAsyncSubmit";
import styles from "./deleteEmployeeModalComponent.module.css";

interface Prop {
  isOpen: boolean;
  onClose: () => void;
  employeeUsername: string;
  onConfirm: () => void | Promise<void>;
  submitError?: string;
  // "employee" (default) = l'owner/manager elimina un dipendente altrui,
  // copy invariata. "self" = cancellazione account self-service (punto 10 del
  // piano export/import/cancellazione): stesso componente, titolo e
  // descrizione cambiano registro invece di duplicare l'intero componente.
  variant?: "employee" | "self";
}

function DeleteEmployeeModalComponent({
  isOpen,
  onClose,
  employeeUsername,
  onConfirm,
  submitError,
  variant = "employee",
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
      title={t(`components.deleteEmployeeModal.title.${variant}`)}
      variant="error"
      onSubmit={handleConfirm}
      primaryAction={
        <ButtonComponent
          onClick={() => {}}
          disabled={isSubmitting}
          variant="danger"
        >
          {isSubmitting
            ? t("components.deleteEmployeeModal.submitting")
            : t("components.deleteEmployeeModal.submit")}
        </ButtonComponent>
      }
      secondaryActions={
        <button
          type="button"
          className={styles.cancelButton}
          onClick={onClose}
        >
          {t("components.deleteEmployeeModal.cancel")}
        </button>
      }
    >
      <p className={styles.description}>
        {t(`components.deleteEmployeeModal.description.${variant}`, { username: employeeUsername })}
      </p>
      {submitError && (
        <p role="alert" className={styles.submitError}>
          {submitError}
        </p>
      )}
    </ModalBaseComponent>
  );
}

export default DeleteEmployeeModalComponent;
