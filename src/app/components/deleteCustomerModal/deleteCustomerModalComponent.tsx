import { useTranslation } from "react-i18next";
import ModalBaseComponent from "../modalBase/modalBaseComponent";
import ButtonComponent from "../button/buttonComponent";
import { useAsyncSubmit } from "../../../shared/hooks/useAsyncSubmit";
import styles from "./deleteCustomerModalComponent.module.css";

interface Prop {
  isOpen: boolean;
  onClose: () => void;
  customerName: string;
  onConfirm: () => void | Promise<void>;
  submitError?: string;
}

// Conferma minimale (nessuna richiesta di ridigitare il nome): a differenza
// di DeleteCompanyModalComponent, eliminare un cliente non elimina anche
// l'account di chi lo fa, stesso livello di gravità di DeleteBackupModalComponent,
// da cui questo componente riprende lo scheletro.
function DeleteCustomerModalComponent({ isOpen, onClose, customerName, onConfirm, submitError }: Prop) {
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
      title={t("components.deleteCustomerModal.title")}
      variant="error"
      onSubmit={handleConfirm}
      primaryAction={
        <ButtonComponent onClick={() => {}} disabled={isSubmitting} variant="danger">
          {isSubmitting
            ? t("components.deleteCustomerModal.submitting")
            : t("components.deleteCustomerModal.confirm")}
        </ButtonComponent>
      }
      secondaryActions={
        <button type="button" className={styles.cancelButton} onClick={onClose}>
          {t("components.deleteCustomerModal.cancel")}
        </button>
      }
    >
      <p className={styles.description}>
        {t("components.deleteCustomerModal.warning", { customerName })}
      </p>
      {submitError && (
        <p role="alert" className={styles.submitError}>
          {submitError}
        </p>
      )}
    </ModalBaseComponent>
  );
}

export default DeleteCustomerModalComponent;
