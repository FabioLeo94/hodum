import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import ModalBaseComponent from "../modalBase/modalBaseComponent";
import ProfileHeaderComponent from "../profileHeader/profileHeaderComponent";
import InputComponent from "../input/inputComponent";
import ButtonComponent from "../button/buttonComponent";
import type { EmployeeRole } from "../../services/auth/authService";
import { validatePassword } from "../../services/validation/validationService";
import { useAsyncSubmit } from "../../../shared/hooks/useAsyncSubmit";
import { getDisplayName } from "../../../shared/utils/displayName";
import styles from "./editEmployeeModalComponent.module.css";

export interface EditEmployeeFormValues {
  // Omesso quando l'owner lascia il campo vuoto (opzionale): il backend
  // applica il fallback su firstName/lastName, vedi getDisplayName
  // (shared/utils/displayName.ts).
  username?: string;
  firstName: string;
  lastName: string;
  pronoun?: string;
  // Omesso quando l'owner non vuole cambiare la password: distinto da una
  // stringa vuota, che invece verrebbe rifiutata dalla validazione.
  password?: string;
  // Promozione/retrocessione project manager <-> dipendente (task "Ruolo
  // project manager"): sempre presente, a differenza di password, perché il
  // select ha sempre un valore selezionato.
  role: EmployeeRole;
}

interface Prop {
  isOpen: boolean;
  onClose: () => void;
  currentUsername: string | null;
  currentFirstName: string;
  currentLastName: string;
  currentPronoun: string | null;
  currentRole: EmployeeRole;
  // Sola lettura (task "Modifica account"): l'owner le vede ma non può
  // cambiarle, da qui fuori dallo state del form sotto.
  currentEmail: string;
  currentCreatedAt: string;
  currentLastLoginAt: string | null;
  onSave: (values: EditEmployeeFormValues) => void | Promise<void>;
  submitError?: string;
}

function EditEmployeeModalComponent({
  isOpen,
  onClose,
  currentUsername,
  currentFirstName,
  currentLastName,
  currentPronoun,
  currentRole,
  currentEmail,
  currentCreatedAt,
  currentLastLoginAt,
  onSave,
  submitError,
}: Prop) {
  const { t } = useTranslation();
  // Precompilato solo al mount: il chiamante rimonta il componente (via
  // `key`) ogni volta che la modale si riapre, stesso pattern di
  // editProjectModalComponent.
  const [firstName, setFirstName] = useState(currentFirstName);
  const [lastName, setLastName] = useState(currentLastName);
  const [username, setUsername] = useState(currentUsername ?? "");
  const [pronoun, setPronoun] = useState(currentPronoun ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<EmployeeRole>(currentRole);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const { isSubmitting, submit } = useAsyncSubmit();
  const roleFieldId = useId();

  const firstNameError =
    submitAttempted && firstName.trim() === ""
      ? t("components.editEmployeeModal.firstNameRequired")
      : "";

  const lastNameError =
    submitAttempted && lastName.trim() === ""
      ? t("components.editEmployeeModal.lastNameRequired")
      : "";

  // La password è opzionale: la validazione scatta solo se l'owner ha
  // iniziato a scriverne una, stesso principio già usato in
  // CreateEmployeeModalComponent per email/password (validazione "a partire
  // dal primo carattere", non solo al submit).
  const passwordError =
    password !== "" && !validatePassword(password)
      ? t("components.editEmployeeModal.passwordInvalid")
      : "";

  const confirmPasswordError =
    password !== "" &&
    (submitAttempted || confirmPassword !== "") &&
    password !== confirmPassword
      ? t("components.editEmployeeModal.passwordMismatch")
      : "";

  function resetForm() {
    setFirstName(currentFirstName);
    setLastName(currentLastName);
    setUsername(currentUsername ?? "");
    setPronoun(currentPronoun ?? "");
    setPassword("");
    setConfirmPassword("");
    setRole(currentRole);
    setSubmitAttempted(false);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  async function handleSave() {
    setSubmitAttempted(true);

    const isValid =
      firstName.trim() !== "" &&
      lastName.trim() !== "" &&
      (password === "" || (validatePassword(password) && password === confirmPassword));

    if (!isValid) return;

    await submit(async () => {
      await onSave({
        username: username.trim() === "" ? undefined : username.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        pronoun: pronoun.trim() === "" ? undefined : pronoun,
        password: password === "" ? undefined : password,
        role,
      });
      resetForm();
    });
  }

  return (
    <ModalBaseComponent
      isOpen={isOpen}
      onClose={handleClose}
      title={
        currentRole === "manager"
          ? t("components.editEmployeeModal.titleManager")
          : t("components.editEmployeeModal.titleEmployee")
      }
      size="medium"
      onSubmit={handleSave}
      primaryAction={
        <ButtonComponent onClick={() => {}} disabled={isSubmitting}>
          {isSubmitting
            ? t("components.editEmployeeModal.submitting")
            : t("components.editEmployeeModal.submit")}
        </ButtonComponent>
      }
      secondaryActions={
        <button
          type="button"
          className={styles.cancelButton}
          onClick={handleClose}
        >
          {t("components.editEmployeeModal.cancel")}
        </button>
      }
    >
      <ProfileHeaderComponent
        displayName={getDisplayName({
          username: currentUsername,
          firstName: currentFirstName,
          lastName: currentLastName,
        })}
        email={currentEmail}
        createdAt={currentCreatedAt}
        lastLoginAt={currentLastLoginAt}
      />
      <div className={styles.fields}>
        <div className={styles.fieldRow}>
          <InputComponent
            type="text"
            name="firstName"
            label={t("components.editEmployeeModal.firstNameLabel")}
            placeholder={t("components.editEmployeeModal.firstNamePlaceholder")}
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            autoComplete="off"
            autoFocus
            required
            error={firstNameError}
            showLabel
          />
          <InputComponent
            type="text"
            name="lastName"
            label={t("components.editEmployeeModal.lastNameLabel")}
            placeholder={t("components.editEmployeeModal.lastNamePlaceholder")}
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            autoComplete="off"
            required
            error={lastNameError}
            showLabel
          />
        </div>
        <div className={styles.fieldRow}>
          <InputComponent
            type="text"
            name="username"
            label={t("components.editEmployeeModal.usernameLabel")}
            placeholder={t("components.editEmployeeModal.usernamePlaceholder")}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="off"
            showLabel
          />
          <InputComponent
            type="text"
            name="pronoun"
            label={t("components.editEmployeeModal.pronounLabel")}
            placeholder={t("components.editEmployeeModal.pronounPlaceholder")}
            value={pronoun}
            onChange={(event) => setPronoun(event.target.value)}
            autoComplete="off"
            showLabel
          />
        </div>
        <div className={styles.roleField}>
          <label className={styles.roleLabel} htmlFor={roleFieldId}>
            {t("components.editEmployeeModal.roleLabel")}
          </label>
          <select
            id={roleFieldId}
            className={styles.roleSelect}
            value={role}
            onChange={(event) => setRole(event.target.value as EmployeeRole)}
          >
            <option value="employee">{t("components.editEmployeeModal.roleEmployee")}</option>
            <option value="manager">{t("components.editEmployeeModal.roleManager")}</option>
          </select>
        </div>
        <div className={styles.passwordGroup}>
          <InputComponent
            type="password"
            name="password"
            label={t("components.editEmployeeModal.passwordLabel")}
            placeholder={t("components.editEmployeeModal.passwordPlaceholder")}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="off"
            error={passwordError}
            showLabel
          />
          <InputComponent
            type="password"
            name="confirmPassword"
            label={t("components.editEmployeeModal.confirmPasswordLabel")}
            placeholder={t("components.editEmployeeModal.confirmPasswordPlaceholder")}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="off"
            error={confirmPasswordError}
            showLabel
          />
        </div>
      </div>
      {submitError && (
        <p role="alert" className={styles.submitError}>
          {submitError}
        </p>
      )}
    </ModalBaseComponent>
  );
}

export default EditEmployeeModalComponent;
