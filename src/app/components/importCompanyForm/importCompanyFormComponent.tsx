import { useId, useState } from "react";
import type { ChangeEvent } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import styles from "./importCompanyFormComponent.module.css";
import InputComponent from "../input/inputComponent";
import ButtonComponent from "../button/buttonComponent";
import RecoveryCodeDisplayComponent from "../recoveryCodeDisplay/recoveryCodeDisplayComponent";
import ImportedCredentialsDisplayComponent from "../importedCredentialsDisplay/importedCredentialsDisplayComponent";
import { importCompany } from "../../services/company/companyService";
import type { CompanyExportData, ImportCompanyResult } from "../../services/company/companyService";
import { persistSession } from "../../services/auth/authService";
import { validatePassword } from "../../services/validation/validationService";

// Tre fasi mostrate in sequenza dopo il submit (mai contemporanee): il form
// resta finché la richiesta non va a buon fine, poi il codice di recupero
// della nuova azienda, poi le credenziali temporanee di dipendenti/manager
// importati — solo dopo entrambe le conferme si naviga alla dashboard.
type Stage = "form" | "recoveryCode" | "credentials";

function ImportCompanyFormComponent() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const fileInputId = useId();
  const fileErrorId = useId();

  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stage, setStage] = useState<Stage>("form");
  const [importResult, setImportResult] = useState<ImportCompanyResult | null>(null);

  const fileError =
    submitAttempted && file === null ? t("components.importCompanyForm.fileRequired") : "";

  const passwordError =
    (submitAttempted || password !== "") && !validatePassword(password)
      ? t("components.importCompanyForm.passwordInvalid")
      : "";

  const confirmPasswordError =
    (submitAttempted || confirmPassword !== "") && password !== confirmPassword
      ? t("components.importCompanyForm.passwordMismatch")
      : "";

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
  }

  async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }
    setFormError("");
    setSubmitAttempted(true);

    const isValid = file !== null && validatePassword(password) && password === confirmPassword;
    if (!isValid) {
      return;
    }

    setIsSubmitting(true);
    try {
      let exportPayload: CompanyExportData;
      try {
        const text = await file!.text();
        exportPayload = JSON.parse(text) as CompanyExportData;
      } catch {
        setFormError(t("components.importCompanyForm.invalidJson"));
        return;
      }

      const result = await importCompany({ export: exportPayload, ownerPassword: password });
      // La sessione parte già da qui, stesso principio di registerFormComponent:
      // il codice di recupero e le credenziali temporanee vanno solo mostrati
      // prima di lasciare la pagina, non bloccano l'accesso.
      persistSession(result.token, result.user, true);
      setImportResult(result);
      setStage("recoveryCode");
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : t("components.importCompanyForm.importFailed"),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (stage === "recoveryCode" && importResult) {
    return (
      <RecoveryCodeDisplayComponent
        recoveryCode={importResult.recoveryCode}
        onConfirm={() => setStage("credentials")}
      />
    );
  }

  if (stage === "credentials" && importResult) {
    return (
      <ImportedCredentialsDisplayComponent
        temporaryPasswords={importResult.temporaryPasswords}
        onConfirm={() => navigate("/dashboard")}
      />
    );
  }

  return (
    <form className={styles.importCompanyForm} onSubmit={handleSubmit} noValidate>
      <div className={styles.fileField}>
        <label className={styles.fileLabel} htmlFor={fileInputId}>
          {t("components.importCompanyForm.fileLabel")}
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
      <InputComponent
        type="password"
        name="ownerPassword"
        label={t("components.importCompanyForm.passwordLabel")}
        placeholder={t("components.importCompanyForm.passwordPlaceholder")}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        autoComplete="new-password"
        required
        error={passwordError}
      />
      <InputComponent
        type="password"
        name="confirmOwnerPassword"
        label={t("components.importCompanyForm.confirmPasswordLabel")}
        placeholder={t("components.importCompanyForm.confirmPasswordPlaceholder")}
        value={confirmPassword}
        onChange={(event) => setConfirmPassword(event.target.value)}
        autoComplete="new-password"
        required
        error={confirmPasswordError}
      />
      {formError && (
        <p role="alert" className={styles.importCompanyFormError}>
          {formError}
        </p>
      )}
      <ButtonComponent onClick={() => {}} disabled={isSubmitting}>
        {isSubmitting
          ? t("components.importCompanyForm.submitting")
          : t("components.importCompanyForm.submit")}
      </ButtonComponent>
    </form>
  );
}

export default ImportCompanyFormComponent;
