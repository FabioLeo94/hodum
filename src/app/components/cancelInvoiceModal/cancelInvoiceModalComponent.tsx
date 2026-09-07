import { useTranslation } from "react-i18next";
import ModalBaseComponent from "../modalBase/modalBaseComponent";
import ButtonComponent from "../button/buttonComponent";
import { useAsyncSubmit } from "../../../shared/hooks/useAsyncSubmit";
import styles from "./cancelInvoiceModalComponent.module.css";

interface Prop {
  isOpen: boolean;
  onClose: () => void;
  invoiceNumber: number;
  onConfirm: () => void | Promise<void>;
  submitError?: string;
}

// Stesso pattern di conferma distruttiva di DeleteProjectModalComponent
// (ModalBaseComponent variant="error" + useAsyncSubmit): qui l'azione non è
// distruttiva in senso stretto (la pre-fattura resta nello storico, vedi
// invoiceService.cancelInvoice) ma sblocca i task collegati, quindi merita lo
// stesso avviso esplicito prima di procedere.
function CancelInvoiceModalComponent({ isOpen, onClose, invoiceNumber, onConfirm, submitError }: Prop) {
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
      title={t("components.cancelInvoiceModal.title")}
      variant="error"
      onSubmit={handleConfirm}
      primaryAction={
        <ButtonComponent onClick={() => {}} disabled={isSubmitting} variant="danger">
          {isSubmitting
            ? t("components.cancelInvoiceModal.submitting")
            : t("components.cancelInvoiceModal.submit")}
        </ButtonComponent>
      }
      secondaryActions={
        <button type="button" className={styles.cancelButton} onClick={onClose}>
          {t("components.cancelInvoiceModal.cancel")}
        </button>
      }
    >
      <p className={styles.description}>
        {t("components.cancelInvoiceModal.description", { number: invoiceNumber })}
      </p>
      {submitError && (
        <p role="alert" className={styles.submitError}>
          {submitError}
        </p>
      )}
    </ModalBaseComponent>
  );
}

export default CancelInvoiceModalComponent;
