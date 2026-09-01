import { useState } from "react";
import styles from "./changePasswordFormComponent.module.css";
import InputComponent from "../input/inputComponent";
import ButtonComponent from "../button/buttonComponent";
import { changePassword } from "../../services/user/userService";
import { getUser, updateStoredUser } from "../../services/auth/authService";
import { validatePassword } from "../../services/validation/validationService";
import { useNavigate } from "react-router";

function ChangePasswordFormComponent() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

    const isValid = validatePassword(password) && password === confirmPassword;

    if (!isValid) {
      return;
    }

    const user = getUser();
    if (!user) {
      setFormError("Sessione non valida. Effettua nuovamente l'accesso.");
      return;
    }

    setIsSubmitting(true);
    try {
      const updatedUser = await changePassword(user.id, password);
      updateStoredUser(updatedUser);
      navigate("/dashboard", { replace: true });
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Cambio password non riuscito. Riprova più tardi.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      className={styles.changePasswordForm}
      onSubmit={handleSubmit}
      noValidate
    >
      <InputComponent
        type="password"
        name="password"
        label="Nuova password"
        placeholder="Nuova password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        autoComplete="new-password"
        required
        error={passwordError}
      />
      <InputComponent
        type="password"
        name="confirmPassword"
        label="Conferma nuova password"
        placeholder="Conferma nuova password"
        value={confirmPassword}
        onChange={(event) => setConfirmPassword(event.target.value)}
        autoComplete="new-password"
        required
        error={confirmPasswordError}
      />
      {formError && (
        <p role="alert" className={styles.changePasswordFormError}>
          {formError}
        </p>
      )}
      <ButtonComponent onClick={() => {}} disabled={isSubmitting}>
        {isSubmitting ? "Aggiornamento in corso..." : "Aggiorna password"}
      </ButtonComponent>
    </form>
  );
}

export default ChangePasswordFormComponent;
