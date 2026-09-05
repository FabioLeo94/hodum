import { useEffect, useState } from "react";
import styles from "./authFormComponent.module.css";
import InputComponent from "../input/inputComponent";
import ButtonComponent from "../button/buttonComponent";
import { login, persistSession, RateLimitError } from "../../services/auth/authService";
import { validateEmail } from "../../services/validation/validationService";
import { Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";

// mm:ss invece del solo numero di secondi: più leggibile quando il rate
// limit di /auth/login (15 minuti, vedi backend/src/app.ts) è quasi intero.
function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function AuthFormComponent() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [retrySecondsLeft, setRetrySecondsLeft] = useState(0);

  const emailError =
    (submitAttempted || email !== "") && !validateEmail(email)
      ? t("components.authForm.emailInvalid")
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
        setPasswordError(t("components.authForm.invalidCredentials"));
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
        label={t("components.authForm.emailLabel")}
        placeholder={t("components.authForm.emailPlaceholder")}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        autoComplete="email"
        required
        error={emailError}
      />
      <InputComponent
        type="password"
        name="password"
        label={t("components.authForm.passwordLabel")}
        placeholder={t("components.authForm.passwordPlaceholder")}
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
        {t("components.authForm.rememberMe")}
      </label>
      <Link to="/recover-password" className={styles.authFormForgotPassword}>
        {t("components.authForm.forgotPassword")}
      </Link>
      {isRateLimited && (
        <p role="alert" className={styles.authFormError}>
          {t("components.authForm.rateLimited", {
            countdown: formatCountdown(retrySecondsLeft),
          })}
        </p>
      )}
      <ButtonComponent onClick={() => {}} disabled={isSubmitting || isRateLimited}>
        {isSubmitting ? t("components.authForm.submitting") : t("components.authForm.submit")}
      </ButtonComponent>
    </form>
  );
}

export default AuthFormComponent;
