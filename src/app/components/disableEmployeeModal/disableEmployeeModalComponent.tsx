import { useTranslation } from "react-i18next";
import ModalBaseComponent from "../modalBase/modalBaseComponent";
import ButtonComponent from "../button/buttonComponent";
import { useAsyncSubmit } from "../../../shared/hooks/useAsyncSubmit";
import styles from "./disableEmployeeModalComponent.module.css";

interface Prop {
  isOpen: boolean;
  onClose: () => void;
  employeeDisplayName: string;
  onConfirm: () => void | Promise<void>;
  submitError?: string;
  // "disable" = il dipendente è attivo e va bloccato (azione con impatto,
  // variante "error"/danger come deleteEmployeeModal). "enable" = il
  // dipendente è già bloccato e va riabilitato (azione di ripristino,
  // variante "success"): stesso componente, copy e stile del bottone
  // cambiano registro invece di duplicare l'intero componente.
  mode: "disable" | "enable";
}

function DisableEmployeeModalComponent({
  isOpen,
  onClose,
  employeeDisplayName,
  onConfirm,
  submitError,
  mode,
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
      title={t(`components.disableEmployeeModal.title.${mode}`)}
      variant={mode === "disable" ? "error" : "success"}
      onSubmit={handleConfirm}
      primaryAction={
        <ButtonComponent
          onClick={() => {}}
          disabled={isSubmitting}
          variant={mode === "disable" ? "danger" : "primary"}
        >
          {isSubmitting
            ? t("components.disableEmployeeModal.submitting")
            : t(`components.disableEmployeeModal.submit.${mode}`)}
        </ButtonComponent>
      }
      secondaryActions={
        <button
          type="button"
          className={styles.cancelButton}
          onClick={onClose}
        >
          {t("components.disableEmployeeModal.cancel")}
        </button>
      }
    >
      <p className={styles.description}>
        {t(`components.disableEmployeeModal.description.${mode}`, { employeeDisplayName })}
      </p>
      {submitError && (
        <p role="alert" className={styles.submitError}>
          {submitError}
        </p>
      )}
    </ModalBaseComponent>
  );
}

export default DisableEmployeeModalComponent;
