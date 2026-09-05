import { useState } from "react";
import { useTranslation } from "react-i18next";
import ModalBaseComponent from "../modalBase/modalBaseComponent";
import InputComponent from "../input/inputComponent";
import ButtonComponent from "../button/buttonComponent";
import { useAsyncSubmit } from "../../../shared/hooks/useAsyncSubmit";
import styles from "./createProjectModalComponent.module.css";

interface Prop {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string) => void | Promise<void>;
  submitError?: string;
}

function CreateProjectModalComponent({
  isOpen,
  onClose,
  onCreate,
  submitError,
}: Prop) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const { isSubmitting, submit } = useAsyncSubmit();

  const nameError =
    submitAttempted && name.trim() === ""
      ? t("components.createProjectModal.nameRequired")
      : "";

  function handleClose() {
    setName("");
    setSubmitAttempted(false);
    onClose();
  }

  async function handleCreate() {
    setSubmitAttempted(true);
    const trimmedName = name.trim();
    if (trimmedName === "") return;

    await submit(async () => {
      await onCreate(trimmedName);
      setName("");
      setSubmitAttempted(false);
    });
  }

  return (
    <ModalBaseComponent
      isOpen={isOpen}
      onClose={handleClose}
      title={t("components.createProjectModal.title")}
      onSubmit={handleCreate}
      primaryAction={
        <ButtonComponent onClick={() => {}} disabled={isSubmitting}>
          {isSubmitting
            ? t("components.createProjectModal.submitting")
            : t("components.createProjectModal.submit")}
        </ButtonComponent>
      }
      secondaryActions={
        <button
          type="button"
          className={styles.cancelButton}
          onClick={handleClose}
        >
          {t("components.createProjectModal.cancel")}
        </button>
      }
    >
      <p className={styles.description}>
        {t("components.createProjectModal.description")}
      </p>
      <InputComponent
        type="text"
        name="projectName"
        label={t("components.createProjectModal.nameLabel")}
        placeholder={t("components.createProjectModal.namePlaceholder")}
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

export default CreateProjectModalComponent;
