import { useState } from "react";
import styles from "./registerFormComponent.module.css";
import InputComponent from "../input/inputComponent";
import ButtonComponent from "../button/buttonComponent";
import RecoveryCodeDisplayComponent from "../recoveryCodeDisplay/recoveryCodeDisplayComponent";
import { registerCompany } from "../../services/company/companyService";
import { persistSession } from "../../services/auth/authService";
import {
  validateEmail,
  validatePassword,
} from "../../services/validation/validationService";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";

function RegisterFormComponent() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [companyName, setCompanyName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [pronoun, setPronoun] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Non-null solo tra la registrazione riuscita e la conferma dell'utente:
  // finché è valorizzato, il form lascia il posto a
  // RecoveryCodeDisplayComponent invece di navigare subito alla dashboard.
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);

  const companyNameError =
    submitAttempted && companyName.trim() === ""
      ? t("components.registerForm.companyNameRequired")
      : "";

  const firstNameError =
    submitAttempted && firstName.trim() === ""
      ? t("components.registerForm.firstNameRequired")
      : "";

  const lastNameError =
    submitAttempted && lastName.trim() === ""
      ? t("components.registerForm.lastNameRequired")
      : "";

  const emailError =
    (submitAttempted || email !== "") && !validateEmail(email)
      ? t("components.registerForm.emailInvalid")
      : "";

  const passwordError =
    (submitAttempted || password !== "") && !validatePassword(password)
      ? t("components.registerForm.passwordInvalid")
      : "";

  const confirmPasswordError =
    (submitAttempted || confirmPassword !== "") &&
    password !== confirmPassword
      ? t("components.registerForm.passwordMismatch")
      : "";

  async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }
    setFormError("");
    setSubmitAttempted(true);

    const isValid =
      companyName.trim() !== "" &&
      firstName.trim() !== "" &&
      lastName.trim() !== "" &&
      validateEmail(email) &&
      validatePassword(password) &&
      password === confirmPassword;

    if (!isValid) {
      return;
    }

    setIsSubmitting(true);
    try {
      const { token, user, recoveryCode: newRecoveryCode } = await registerCompany({
        companyName,
        username: username.trim() === "" ? undefined : username.trim(),
        firstName,
        lastName,
        pronoun: pronoun.trim() === "" ? undefined : pronoun,
        email,
        password,
      });
      // La sessione parte già da qui (come prima): il codice di recupero va
      // solo mostrato prima di lasciare la pagina, non blocca l'accesso.
      persistSession(token, user, true);
      setRecoveryCode(newRecoveryCode);
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : t("components.registerForm.registrationFailed"),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (recoveryCode) {
    return (
      <RecoveryCodeDisplayComponent
        recoveryCode={recoveryCode}
        onConfirm={() => navigate("/dashboard")}
      />
    );
  }

  return (
    <form className={styles.registerForm} onSubmit={handleSubmit} noValidate>
      <InputComponent
        type="text"
        name="companyName"
        label={t("components.registerForm.companyNameLabel")}
        placeholder={t("components.registerForm.companyNamePlaceholder")}
        value={companyName}
        onChange={(event) => setCompanyName(event.target.value)}
        autoComplete="organization"
        required
        error={companyNameError}
      />
      <InputComponent
        type="text"
        name="firstName"
        label={t("components.registerForm.firstNameLabel")}
        placeholder={t("components.registerForm.firstNamePlaceholder")}
        value={firstName}
        onChange={(event) => setFirstName(event.target.value)}
        autoComplete="given-name"
        required
        error={firstNameError}
      />
      <InputComponent
        type="text"
        name="lastName"
        label={t("components.registerForm.lastNameLabel")}
        placeholder={t("components.registerForm.lastNamePlaceholder")}
        value={lastName}
        onChange={(event) => setLastName(event.target.value)}
        autoComplete="family-name"
        required
        error={lastNameError}
      />
      <InputComponent
        type="text"
        name="username"
        label={t("components.registerForm.usernameLabel")}
        placeholder={t("components.registerForm.usernamePlaceholder")}
        value={username}
        onChange={(event) => setUsername(event.target.value)}
        autoComplete="username"
      />
      <InputComponent
        type="text"
        name="pronoun"
        label={t("components.registerForm.pronounLabel")}
        placeholder={t("components.registerForm.pronounPlaceholder")}
        value={pronoun}
        onChange={(event) => setPronoun(event.target.value)}
        autoComplete="off"
      />
      <InputComponent
        type="email"
        name="email"
        label={t("components.registerForm.emailLabel")}
        placeholder={t("components.registerForm.emailPlaceholder")}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        autoComplete="email"
        required
        error={emailError}
      />
      <InputComponent
        type="password"
        name="password"
        label={t("components.registerForm.passwordLabel")}
        placeholder={t("components.registerForm.passwordPlaceholder")}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        autoComplete="new-password"
        required
        error={passwordError}
      />
      <InputComponent
        type="password"
        name="confirmPassword"
        label={t("components.registerForm.confirmPasswordLabel")}
        placeholder={t("components.registerForm.confirmPasswordPlaceholder")}
        value={confirmPassword}
        onChange={(event) => setConfirmPassword(event.target.value)}
        autoComplete="new-password"
        required
        error={confirmPasswordError}
      />
      {formError && (
        <p role="alert" className={styles.registerFormError}>
          {formError}
        </p>
      )}
      <ButtonComponent onClick={() => {}} disabled={isSubmitting}>
        {isSubmitting
          ? t("components.registerForm.submitting")
          : t("components.registerForm.submit")}
      </ButtonComponent>
    </form>
  );
}

export default RegisterFormComponent;
