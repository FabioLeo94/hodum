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

function RegisterFormComponent() {
  const navigate = useNavigate();
  const [companyName, setCompanyName] = useState("");
  const [username, setUsername] = useState("");
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
      ? "Inserire il nome dell'azienda."
      : "";

  const usernameError =
    submitAttempted && username.trim() === "" ? "Inserire uno username." : "";

  const emailError =
    (submitAttempted || email !== "") && !validateEmail(email)
      ? "Inserire una email valida."
      : "";

  const passwordError =
    (submitAttempted || password !== "") && !validatePassword(password)
      ? "La password deve contenere almeno 8 caratteri, una minuscola, una maiuscola e un numero."
      : "";

  const confirmPasswordError =
    (submitAttempted || confirmPassword !== "") &&
    password !== confirmPassword
      ? "Le password non coincidono."
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
      username.trim() !== "" &&
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
        username,
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
          : "Registrazione non riuscita. Riprova più tardi.",
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
        label="Nome azienda"
        placeholder="Nome azienda"
        value={companyName}
        onChange={(event) => setCompanyName(event.target.value)}
        autoComplete="organization"
        required
        error={companyNameError}
      />
      <InputComponent
        type="text"
        name="username"
        label="Username"
        placeholder="Username"
        value={username}
        onChange={(event) => setUsername(event.target.value)}
        autoComplete="username"
        required
        error={usernameError}
      />
      <InputComponent
        type="email"
        name="email"
        label="Email"
        placeholder="Email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        autoComplete="email"
        required
        error={emailError}
      />
      <InputComponent
        type="password"
        name="password"
        label="Password"
        placeholder="Password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        autoComplete="new-password"
        required
        error={passwordError}
      />
      <InputComponent
        type="password"
        name="confirmPassword"
        label="Conferma password"
        placeholder="Conferma password"
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
        {isSubmitting ? "Registrazione in corso..." : "Registrati"}
      </ButtonComponent>
    </form>
  );
}

export default RegisterFormComponent;
