import { useState } from "react";
import { useTranslation } from "react-i18next";
import ModalBaseComponent from "../modalBase/modalBaseComponent";
import InputComponent from "../input/inputComponent";
import ButtonComponent from "../button/buttonComponent";
import { useAsyncSubmit } from "../../../shared/hooks/useAsyncSubmit";
import styles from "./deleteCompanyModalComponent.module.css";

interface Prop {
  isOpen: boolean;
  onClose: () => void;
  companyName: string;
  onConfirm: () => void | Promise<void>;
  submitError?: string;
}

// Ricalca DeleteEmployeeModalComponent (variant="error", useAsyncSubmit), ma
// una password non basta per un'operazione irreversibile di questa portata
// (rimuove l'intera azienda, incluso l'owner): l'owner deve ridigitare
// esattamente il nome dell'azienda, stesso pattern di conferma di GitHub.
// Confronto stringa locale, case-sensitive, nessuna libreria.
function DeleteCompanyModalComponent({
  isOpen,
  onClose,
  companyName,
  onConfirm,
  submitError,
}: Prop) {
  const { t } = useTranslation();
  const [confirmationText, setConfirmationText] = useState("");
  const { isSubmitting, submit } = useAsyncSubmit();

  const isConfirmed = confirmationText === companyName;

  function handleClose() {
    setConfirmationText("");
    onClose();
  }

  async function handleConfirm() {
    if (!isConfirmed) return;
    await submit(async () => {
      await onConfirm();
    });
  }

  return (
    <ModalBaseComponent
      isOpen={isOpen}
      onClose={handleClose}
      title={t("components.deleteCompanyModal.title")}
      variant="error"
      onSubmit={handleConfirm}
      primaryAction={
        <ButtonComponent
          onClick={() => {}}
          disabled={isSubmitting || !isConfirmed}
          variant="danger"
        >
          {isSubmitting
            ? t("components.deleteCompanyModal.submitting")
            : t("components.deleteCompanyModal.submit")}
        </ButtonComponent>
      }
      secondaryActions={
        <button type="button" className={styles.cancelButton} onClick={handleClose}>
          {t("components.deleteCompanyModal.cancel")}
        </button>
      }
    >
      <p className={styles.description}>
        {t("components.deleteCompanyModal.description", { companyName })}
      </p>
      <InputComponent
        type="text"
        name="companyNameConfirmation"
        label={t("components.deleteCompanyModal.confirmationLabel", { companyName })}
        placeholder={companyName}
        value={confirmationText}
        onChange={(event) => setConfirmationText(event.target.value)}
        autoComplete="off"
        autoFocus
        showLabel
      />
      {submitError && (
        <p role="alert" className={styles.submitError}>
          {submitError}
        </p>
      )}
    </ModalBaseComponent>
  );
}

export default DeleteCompanyModalComponent;
