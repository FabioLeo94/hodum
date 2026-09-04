import { useEffect, useState } from "react";
import styles from "./recoverPasswordFormComponent.module.css";
import InputComponent from "../input/inputComponent";
import ButtonComponent from "../button/buttonComponent";
import RecoveryCodeDisplayComponent from "../recoveryCodeDisplay/recoveryCodeDisplayComponent";
import {
  persistSession,
  recoverPassword,
  RateLimitError,
} from "../../services/auth/authService";
import {
  validateEmail,
  validatePassword,
} from "../../services/validation/validationService";
import { useNavigate } from "react-router";

// mm:ss, stesso formato/motivo di authFormComponent.tsx.
function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function RecoverPasswordFormComponent() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [retrySecondsLeft, setRetrySecondsLeft] = useState(0);
  // Non-null solo tra il recupero riuscito e la conferma dell'utente: stesso
  // pattern di registerFormComponent, il nuovo codice ruotato dal backend
  // (authService.recoverPassword) va mostrato prima di lasciare la pagina.
  const [newRecoveryCode, setNewRecoveryCode] = useState<string | null>(null);

  const emailError =
    (submitAttempted || email !== "") && !validateEmail(email)
      ? "Inserire una email valida."
      : "";

  const recoveryCodeError =
    submitAttempted && recoveryCode.trim() === ""
      ? "Inserire il codice di recupero."
      : "";

  const newPasswordError =
    (submitAttempted || newPassword !== "") && !validatePassword(newPassword)
      ? "La password deve contenere almeno 8 caratteri, una minuscola, una maiuscola e un numero."
      : "";

  const confirmNewPasswordError =
    (submitAttempted || confirmNewPassword !== "") &&
    newPassword !== confirmNewPassword
      ? "Le password non coincidono."
      : "";

  const isRateLimited = retrySecondsLeft > 0;

  // setTimeout auto-riprogrammato, stesso pattern di authFormComponent.tsx.
  useEffect(() => {
    if (retrySecondsLeft <= 0) {
      return;
    }
    const timer = window.setTimeout(
      () => setRetrySecondsLeft((seconds) => seconds - 1),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [retrySecondsLeft]);

  async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting || isRateLimited) {
      return;
    }
    setFormError("");
    setSubmitAttempted(true);

    const isValid =
      validateEmail(email) &&
      recoveryCode.trim() !== "" &&
      validatePassword(newPassword) &&
      newPassword === confirmNewPassword;

    if (!isValid) {
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await recoverPassword(email, recoveryCode, newPassword);
      if (!result) {
        setFormError("Email o codice di recupero non validi.");
        return;
      }

      persistSession(result.token, result.user, true);
      setNewRecoveryCode(result.recoveryCode);
    } catch (error) {
      if (error instanceof RateLimitError) {
        setRetrySecondsLeft(error.retryAfterSeconds);
        return;
      }
      setFormError(
        error instanceof Error
          ? error.message
          : "Recupero password non riuscito. Riprova più tardi.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (newRecoveryCode) {
    return (
      <RecoveryCodeDisplayComponent
        recoveryCode={newRecoveryCode}
        confirmLabel="Ho salvato il nuovo codice, vai alla dashboard"
        onConfirm={() => navigate("/dashboard")}
      />
    );
  }

  return (
    <form
      className={styles.recoverPasswordForm}
      onSubmit={handleSubmit}
      noValidate
    >
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
        type="text"
        name="recoveryCode"
        label="Codice di recupero"
        placeholder="XXXX-XXXX-XXXX-XXXX"
        value={recoveryCode}
        onChange={(event) => setRecoveryCode(event.target.value)}
        autoComplete="off"
        required
        error={recoveryCodeError}
      />
      <InputComponent
        type="password"
        name="newPassword"
        label="Nuova password"
        placeholder="Nuova password"
        value={newPassword}
        onChange={(event) => setNewPassword(event.target.value)}
        autoComplete="new-password"
        required
        error={newPasswordError}
      />
      <InputComponent
        type="password"
        name="confirmNewPassword"
        label="Conferma nuova password"
        placeholder="Conferma nuova password"
        value={confirmNewPassword}
        onChange={(event) => setConfirmNewPassword(event.target.value)}
        autoComplete="new-password"
        required
        error={confirmNewPasswordError}
      />
      {isRateLimited && (
        <p role="alert" className={styles.recoverPasswordFormError}>
          Troppi tentativi di recupero. Riprova tra{" "}
          {formatCountdown(retrySecondsLeft)}.
        </p>
      )}
      {formError && (
        <p role="alert" className={styles.recoverPasswordFormError}>
          {formError}
        </p>
      )}
      <ButtonComponent onClick={() => {}} disabled={isSubmitting || isRateLimited}>
        {isSubmitting ? "Recupero in corso..." : "Recupera l'accesso"}
      </ButtonComponent>
    </form>
  );
}

export default RecoverPasswordFormComponent;
