import { useEffect, useState } from "react";
import styles from "./authFormComponent.module.css";
import InputComponent from "../input/inputComponent";
import ButtonComponent from "../button/buttonComponent";
import { login, persistSession, RateLimitError } from "../../services/auth/authService";
import { validateEmail } from "../../services/validation/validationService";
import { Link, useNavigate } from "react-router";

// mm:ss invece del solo numero di secondi: più leggibile quando il rate
// limit di /auth/login (15 minuti, vedi backend/src/app.ts) è quasi intero.
function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function AuthFormComponent() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [retrySecondsLeft, setRetrySecondsLeft] = useState(0);

  const emailError =
    (submitAttempted || email !== "") && !validateEmail(email)
      ? "Inserire una email valida."
      : "";
  const isRateLimited = retrySecondsLeft > 0;

  // setTimeout auto-riprogrammato invece di setInterval: si ferma da solo
  // appena retrySecondsLeft tocca 0, senza un secondo useEffect per pulirlo.
  useEffect(() => {
    if (retrySecondsLeft <= 0) {
      return;
    }
    const timer = window.setTimeout(() => setRetrySecondsLeft((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [retrySecondsLeft]);

  async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting || isRateLimited) {
      return;
    }
    setPasswordError("");
    setSubmitAttempted(true);

    if (!validateEmail(email)) {
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await login(email, password);
      if (!result) {
        setPasswordError("Email o password non corretti.");
        return;
      }

      persistSession(result.token, result.user, rememberMe);
      navigate(result.user.mustChangePassword ? "/change-password" : "/dashboard");
    } catch (err) {
      if (!(err instanceof RateLimitError)) {
        throw err;
      }
      setRetrySecondsLeft(err.retryAfterSeconds);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className={styles.authForm} onSubmit={handleSubmit} noValidate>
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
        onChange={(event) => {
          setPassword(event.target.value);
          setPasswordError("");
        }}
        autoComplete="current-password"
        required
        error={passwordError}
      />
      <label className={styles.authRememberMe}>
        <input
          className={styles.authCheckbox}
          type="checkbox"
          checked={rememberMe}
          onChange={(event) => setRememberMe(event.target.checked)}
        />
        Resta connesso
      </label>
      <Link to="/recover-password" className={styles.authFormForgotPassword}>
        Password dimenticata?
      </Link>
      {isRateLimited && (
        <p role="alert" className={styles.authFormError}>
          Troppi tentativi di accesso. Riprova tra {formatCountdown(retrySecondsLeft)}.
        </p>
      )}
      <ButtonComponent onClick={() => {}} disabled={isSubmitting || isRateLimited}>
        {isSubmitting ? "Accesso in corso..." : "Accedi"}
      </ButtonComponent>
    </form>
  );
}

export default AuthFormComponent;
