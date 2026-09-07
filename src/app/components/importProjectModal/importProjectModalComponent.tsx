import { useId, useState } from "react";
import type { ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import ModalBaseComponent from "../modalBase/modalBaseComponent";
import ButtonComponent from "../button/buttonComponent";
import { parseProjectExport } from "../../../shared/utils/projectImport";
import type { ParsedProjectImport } from "../../../shared/utils/projectImport";
import { useAsyncSubmit } from "../../../shared/hooks/useAsyncSubmit";
import styles from "./importProjectModalComponent.module.css";

interface Prop {
  isOpen: boolean;
  onClose: () => void;
  onImport: (data: ParsedProjectImport) => Promise<void>;
  submitError?: string;
}

function ImportProjectModalComponent({ isOpen, onClose, onImport, submitError }: Prop) {
  const { t } = useTranslation();
  const fileInputId = useId();
  const fileErrorId = useId();
  const [file, setFile] = useState<File | null>(null);
  // Errore di lettura/parsing del file, distinto da submitError: quest'ultimo
  // arriva dal chiamante (fallimento della creazione lato server), questo
  // resta locale e non richiede di richiudere/riaprire la modale per essere
  // ricontrollato, stesso principio di formError in importCompanyFormComponent.
  const [localError, setLocalError] = useState("");
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const { isSubmitting, submit } = useAsyncSubmit();

  const fileError =
    submitAttempted && file === null ? t("components.importProjectModal.fileRequired") : "";

  function handleClose() {
    setFile(null);
    setLocalError("");
    setSubmitAttempted(false);
    onClose();
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setLocalError("");
    setFile(event.target.files?.[0] ?? null);
  }

  async function handleImport() {
    setSubmitAttempted(true);
    setLocalError("");
    if (!file) return;

    await submit(async () => {
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(await file.text());
      } catch {
        setLocalError(t("components.importProjectModal.invalidJson"));
        return;
      }

      const parsed = parseProjectExport(parsedJson);
      if (!parsed) {
        setLocalError(t("components.importProjectModal.invalidStructure"));
        return;
      }

      await onImport(parsed);
      setFile(null);
      setSubmitAttempted(false);
    });
  }

  return (
    <ModalBaseComponent
      isOpen={isOpen}
      onClose={handleClose}
      title={t("components.importProjectModal.title")}
      onSubmit={handleImport}
      primaryAction={
        <ButtonComponent onClick={() => {}} disabled={isSubmitting}>
          {isSubmitting
            ? t("components.importProjectModal.submitting")
            : t("components.importProjectModal.submit")}
        </ButtonComponent>
      }
      secondaryActions={
        <button type="button" className={styles.cancelButton} onClick={handleClose}>
          {t("components.importProjectModal.cancel")}
        </button>
      }
    >
      <p className={styles.description}>{t("components.importProjectModal.description")}</p>
      <div className={styles.fileField}>
        <label className={styles.fileLabel} htmlFor={fileInputId}>
          {t("components.importProjectModal.fileLabel")}
        </label>
        <input
          id={fileInputId}
          className={styles.fileInput}
          type="file"
          accept="application/json"
          onChange={handleFileChange}
          aria-invalid={fileError ? true : undefined}
          aria-describedby={fileError ? fileErrorId : undefined}
        />
        {file && <p className={styles.fileName}>{file.name}</p>}
        {fileError && (
          <p id={fileErrorId} role="alert" className={styles.fieldError}>
            {fileError}
          </p>
        )}
      </div>
      {(localError || submitError) && (
        <p role="alert" className={styles.submitError}>
          {localError || submitError}
        </p>
      )}
    </ModalBaseComponent>
  );
}

export default ImportProjectModalComponent;
