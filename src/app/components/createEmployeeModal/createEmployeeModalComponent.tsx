import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import ModalBaseComponent from "../modalBase/modalBaseComponent";
import InputComponent from "../input/inputComponent";
import ButtonComponent from "../button/buttonComponent";
import type { EmployeeRole } from "../../services/auth/authService";
import {
  validateEmail,
  validatePassword,
} from "../../services/validation/validationService";
import { useAsyncSubmit } from "../../../shared/hooks/useAsyncSubmit";
import styles from "./createEmployeeModalComponent.module.css";

export interface CreateEmployeeFormValues {
  // Assente quando l'owner lascia il campo vuoto (opzionale): il backend
  // applica il fallback su firstName/lastName, vedi getDisplayName
  // (shared/utils/displayName.ts).
  username?: string;
  firstName: string;
  lastName: string;
  pronoun?: string;
  email: string;
  password: string;
  role: EmployeeRole;
}

interface Prop {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (values: CreateEmployeeFormValues) => void | Promise<void>;
  submitError?: string;
}

function CreateEmployeeModalComponent({
  isOpen,
  onClose,
  onCreate,
  submitError,
}: Prop) {
  const { t } = useTranslation();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [pronoun, setPronoun] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<EmployeeRole>("employee");
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const { isSubmitting, submit } = useAsyncSubmit();
  const roleFieldId = useId();

  const firstNameError =
    submitAttempted && firstName.trim() === ""
      ? t("components.createEmployeeModal.firstNameRequired")
      : "";

  const lastNameError =
    submitAttempted && lastName.trim() === ""
      ? t("components.createEmployeeModal.lastNameRequired")
      : "";

  const emailError =
    (submitAttempted || email !== "") && !validateEmail(email)
      ? t("components.createEmployeeModal.emailInvalid")
      : "";

  const passwordError =
    (submitAttempted || password !== "") && !validatePassword(password)
      ? t("components.createEmployeeModal.passwordInvalid")
      : "";

  const confirmPasswordError =
    (submitAttempted || confirmPassword !== "") &&
    password !== confirmPassword
      ? t("components.createEmployeeModal.passwordMismatch")
      : "";

  function resetForm() {
    setFirstName("");
    setLastName("");
    setUsername("");
    setPronoun("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setRole("employee");
    setSubmitAttempted(false);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  async function handleCreate() {
    setSubmitAttempted(true);

    const isValid =
      firstName.trim() !== "" &&
      lastName.trim() !== "" &&
      validateEmail(email) &&
      validatePassword(password) &&
      password === confirmPassword;

    if (!isValid) return;

    await submit(async () => {
      await onCreate({
        username: username.trim() === "" ? undefined : username.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        pronoun: pronoun.trim() === "" ? undefined : pronoun,
        email,
        password,
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
        role === "manager"
          ? t("components.createEmployeeModal.titleManager")
          : t("components.createEmployeeModal.titleEmployee")
      }
      size="medium"
      onSubmit={handleCreate}
      primaryAction={
        <ButtonComponent onClick={() => {}} disabled={isSubmitting}>
          {isSubmitting
            ? t("components.createEmployeeModal.submitting")
            : t("components.createEmployeeModal.submit")}
        </ButtonComponent>
      }
      secondaryActions={
        <button
          type="button"
          className={styles.cancelButton}
          onClick={handleClose}
        >
          {t("components.createEmployeeModal.cancel")}
        </button>
      }
    >
      <p className={styles.description}>
        {t("components.createEmployeeModal.description")}
      </p>
      <div className={styles.fields}>
        <div className={styles.fieldRow}>
          <InputComponent
            type="text"
            name="firstName"
            label={t("components.createEmployeeModal.firstNameLabel")}
            placeholder={t("components.createEmployeeModal.firstNamePlaceholder")}
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
            label={t("components.createEmployeeModal.lastNameLabel")}
            placeholder={t("components.createEmployeeModal.lastNamePlaceholder")}
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
            label={t("components.createEmployeeModal.usernameLabel")}
            placeholder={t("components.createEmployeeModal.usernamePlaceholder")}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="off"
            showLabel
          />
          <InputComponent
            type="text"
            name="pronoun"
            label={t("components.createEmployeeModal.pronounLabel")}
            placeholder={t("components.createEmployeeModal.pronounPlaceholder")}
            value={pronoun}
            onChange={(event) => setPronoun(event.target.value)}
            autoComplete="off"
            showLabel
          />
        </div>
        <InputComponent
          type="email"
          name="email"
          label={t("components.createEmployeeModal.emailLabel")}
          placeholder={t("components.createEmployeeModal.emailPlaceholder")}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="off"
          required
          error={emailError}
          showLabel
        />
        <div className={styles.roleField}>
          <label className={styles.roleLabel} htmlFor={roleFieldId}>
            {t("components.createEmployeeModal.roleLabel")}
          </label>
          <select
            id={roleFieldId}
            className={styles.roleSelect}
            value={role}
            onChange={(event) => setRole(event.target.value as EmployeeRole)}
          >
            <option value="employee">{t("components.createEmployeeModal.roleEmployee")}</option>
            <option value="manager">{t("components.createEmployeeModal.roleManager")}</option>
          </select>
        </div>
        {/* Password iniziale e conferma sono un'unica "risposta" divisa in due
            campi: un gap più stretto le lega visivamente tra loro, mentre lo
            spazio in più prima del gruppo (vedi .passwordGroup) le separa dai
            campi anagrafici sopra. */}
        <div className={styles.passwordGroup}>
          <InputComponent
            type="password"
            name="password"
            label={t("components.createEmployeeModal.passwordLabel")}
            placeholder={t("components.createEmployeeModal.passwordPlaceholder")}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="off"
            required
            error={passwordError}
            showLabel
          />
          <InputComponent
            type="password"
            name="confirmPassword"
            label={t("components.createEmployeeModal.confirmPasswordLabel")}
            placeholder={t("components.createEmployeeModal.confirmPasswordPlaceholder")}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="off"
            required
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

export default CreateEmployeeModalComponent;
