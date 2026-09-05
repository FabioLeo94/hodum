import { useState } from "react";
import { useTranslation } from "react-i18next";
import ModalBaseComponent from "../modalBase/modalBaseComponent";
import InputComponent from "../input/inputComponent";
import ButtonComponent from "../button/buttonComponent";
import { validateEmail, validatePassword } from "../../services/validation/validationService";
import { useAsyncSubmit } from "../../../shared/hooks/useAsyncSubmit";
import { formatDate } from "../../../shared/utils/formatDate";
import styles from "./editAccountModalComponent.module.css";

export interface EditAccountFormValues {
  username: string;
  email: string;
  // Omesso quando l'utente non vuole cambiare la password: a differenza di
  // EditEmployeeModalComponent, qui è l'utente stesso a impostarla, quindi
  // must_change_password non va mai forzato di nuovo (vedi updateUser lato
  // backend, che lo forza solo quando isOwnerEditingEmployee).
  password?: string;
}

interface Prop {
  isOpen: boolean;
  onClose: () => void;
  currentUsername: string;
  currentEmail: string;
  currentCreatedAt: string;
  // L'owner non ha un percorso di cancellazione self-service (vincolo FK
  // companies.owner_id/users.company_id, vedi deleteCompanyModalComponent):
  // deve passare dalla cancellazione azienda. Solo per decidere se mostrare
  // "Elimina il mio account" sotto, non cambia il resto della modale.
  isOwner: boolean;
  onSave: (values: EditAccountFormValues) => void | Promise<void>;
  // Fire-and-forget dal punto di vista della modale: eventuali errori sono
  // già catturati e trasformati in exportError dal chiamante (stesso pattern
  // di submitError/onSave), qui serve solo per disabilitare il bottone
  // durante il download.
  onExport: () => void | Promise<void>;
  onRequestDelete: () => void;
  submitError?: string;
  exportError?: string;
}

function EditAccountModalComponent({
  isOpen,
  onClose,
  currentUsername,
  currentEmail,
  currentCreatedAt,
  isOwner,
  onSave,
  onExport,
  onRequestDelete,
  submitError,
  exportError,
}: Prop) {
  const { t } = useTranslation();
  // Precompilato solo al mount: il chiamante rimonta il componente (via
  // `key`) ogni volta che la modale si riapre, stesso pattern di
  // EditEmployeeModalComponent.
  const [username, setUsername] = useState(currentUsername);
  const [email, setEmail] = useState(currentEmail);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const { isSubmitting, submit } = useAsyncSubmit();
  // Istanza separata da submit sopra: l'esportazione non condivide lo stesso
  // ciclo isSubmitting del salvataggio, i due bottoni devono potersi
  // disabilitare indipendentemente.
  const { isSubmitting: isExporting, submit: submitExport } = useAsyncSubmit();

  const usernameError =
    submitAttempted && username.trim() === ""
      ? t("components.editAccountModal.usernameRequired")
      : "";

  const emailError =
    (submitAttempted || email !== "") && !validateEmail(email)
      ? t("components.editAccountModal.emailInvalid")
      : "";

  // La password è opzionale: la validazione scatta solo se si è iniziato a
  // scriverne una nuova, stesso principio di EditEmployeeModalComponent.
  const passwordError =
    password !== "" && !validatePassword(password)
      ? t("components.editAccountModal.passwordInvalid")
      : "";

  const confirmPasswordError =
    password !== "" &&
    (submitAttempted || confirmPassword !== "") &&
    password !== confirmPassword
      ? t("components.editAccountModal.passwordMismatch")
      : "";

  function resetForm() {
    setUsername(currentUsername);
    setEmail(currentEmail);
    setPassword("");
    setConfirmPassword("");
    setSubmitAttempted(false);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  async function handleExport() {
    await submitExport(async () => {
      await onExport();
    });
  }

  async function handleSave() {
    setSubmitAttempted(true);

    const trimmedUsername = username.trim();
    const isValid =
      trimmedUsername !== "" &&
      validateEmail(email) &&
      (password === "" || (validatePassword(password) && password === confirmPassword));

    if (!isValid) return;

    await submit(async () => {
      await onSave({
        username: trimmedUsername,
        email,
        password: password === "" ? undefined : password,
      });
      resetForm();
    });
  }

  return (
    <ModalBaseComponent
      isOpen={isOpen}
      onClose={handleClose}
      title={t("components.editAccountModal.title")}
      onSubmit={handleSave}
      primaryAction={
        <ButtonComponent onClick={() => {}} disabled={isSubmitting}>
          {isSubmitting
            ? t("components.editAccountModal.submitting")
            : t("components.editAccountModal.submit")}
        </ButtonComponent>
      }
      secondaryActions={
        <button type="button" className={styles.cancelButton} onClick={handleClose}>
          {t("components.editAccountModal.cancel")}
        </button>
      }
    >
      <p className={styles.description}>
        {t("components.editAccountModal.description")}
      </p>
      <div className={styles.metaInfo}>
        <p className={styles.metaRow}>
          <span className={styles.metaLabel}>
            {t("components.editAccountModal.createdAtLabel")}
          </span>
          <span className={styles.metaValue}>{formatDate(currentCreatedAt)}</span>
        </p>
      </div>
      <div className={styles.fields}>
        <InputComponent
          type="text"
          name="username"
          label={t("components.editAccountModal.usernameLabel")}
          placeholder={t("components.editAccountModal.usernamePlaceholder")}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="off"
          autoFocus
          required
          error={usernameError}
          showLabel
        />
        <InputComponent
          type="email"
          name="email"
          label={t("components.editAccountModal.emailLabel")}
          placeholder={t("components.editAccountModal.emailPlaceholder")}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="off"
          required
          error={emailError}
          showLabel
        />
        <div className={styles.passwordGroup}>
          <InputComponent
            type="password"
            name="password"
            label={t("components.editAccountModal.passwordLabel")}
            placeholder={t("components.editAccountModal.passwordPlaceholder")}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="off"
            error={passwordError}
            showLabel
          />
          <InputComponent
            type="password"
            name="confirmPassword"
            label={t("components.editAccountModal.confirmPasswordLabel")}
            placeholder={t("components.editAccountModal.confirmPasswordPlaceholder")}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="off"
            error={confirmPasswordError}
            showLabel
          />
        </div>
      </div>

      <div className={styles.exportRow}>
        <button
          type="button"
          className={styles.exportButton}
          onClick={handleExport}
          disabled={isExporting}
        >
          {isExporting
            ? t("components.editAccountModal.exporting")
            : t("components.editAccountModal.exportButton")}
        </button>
      </div>
      {exportError && (
        <p role="alert" className={styles.submitError}>
          {exportError}
        </p>
      )}

      {/* Non mostrato all'owner: deve passare dal flusso di cancellazione
          azienda (deleteCompanyModalComponent), per via del vincolo FK
          companies.owner_id/users.company_id che non ha una cascade. */}
      {!isOwner && (
        <div className={styles.dangerZone}>
          <p className={styles.dangerZoneHint}>
            {t("components.editAccountModal.deleteAccountHint")}
          </p>
          <ButtonComponent onClick={onRequestDelete} variant="danger" type="button">
            {t("components.editAccountModal.deleteAccountButton")}
          </ButtonComponent>
        </div>
      )}

      {submitError && (
        <p role="alert" className={styles.submitError}>
          {submitError}
        </p>
      )}
    </ModalBaseComponent>
  );
}

export default EditAccountModalComponent;
