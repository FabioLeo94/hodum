import { useState } from "react";
import { useTranslation } from "react-i18next";
import ModalBaseComponent from "../modalBase/modalBaseComponent";
import InputComponent from "../input/inputComponent";
import ButtonComponent from "../button/buttonComponent";
import { useAsyncSubmit } from "../../../shared/hooks/useAsyncSubmit";
import styles from "./renameProjectModalComponent.module.css";

interface Prop {
  isOpen: boolean;
  onClose: () => void;
  currentName: string;
  onRename: (name: string) => void | Promise<void>;
  submitError?: string;
}

function RenameProjectModalComponent({
  isOpen,
  onClose,
  currentName,
  onRename,
  submitError,
}: Prop) {
  const { t } = useTranslation();
  // Precompilato solo al mount di questa istanza: il chiamante rimonta il
  // componente (via `key`) ogni volta che la modale si riapre, così il valore
  // iniziale è sempre il nome corrente senza un effect di risincronizzazione.
  const [name, setName] = useState(currentName);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const { isSubmitting, submit } = useAsyncSubmit();

  const nameError =
    submitAttempted && name.trim() === ""
      ? t("components.renameProjectModal.nameRequired")
      : "";

  function handleClose() {
    setSubmitAttempted(false);
    onClose();
  }

  async function handleRename() {
    setSubmitAttempted(true);
    const trimmedName = name.trim();
    if (trimmedName === "") return;

    await submit(async () => {
      await onRename(trimmedName);
      setSubmitAttempted(false);
    });
  }

  return (
    <ModalBaseComponent
      isOpen={isOpen}
      onClose={handleClose}
      title={t("components.renameProjectModal.title")}
      onSubmit={handleRename}
      primaryAction={
        <ButtonComponent onClick={() => {}} disabled={isSubmitting}>
          {isSubmitting
            ? t("components.renameProjectModal.submitting")
            : t("components.renameProjectModal.submit")}
        </ButtonComponent>
      }
      secondaryActions={
        <button
          type="button"
          className={styles.cancelButton}
          onClick={handleClose}
        >
          {t("components.renameProjectModal.cancel")}
        </button>
      }
    >
      <InputComponent
        type="text"
        name="projectName"
        label={t("components.renameProjectModal.nameLabel")}
        placeholder={t("components.renameProjectModal.namePlaceholder")}
        value={name}
        onChange={(event) => setName(event.target.value)}
        autoComplete="off"
        autoFocus
        error={nameError}
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

export default RenameProjectModalComponent;
