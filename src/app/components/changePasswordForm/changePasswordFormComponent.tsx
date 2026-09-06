import { useState } from "react";
import styles from "./changePasswordFormComponent.module.css";
import InputComponent from "../input/inputComponent";
import ButtonComponent from "../button/buttonComponent";
import { changePassword } from "../../services/user/userService";
import { getUser, updateStoredUser } from "../../services/auth/authService";
import { notifySuccess } from "../../services/notify/notifyService";
import { validatePassword } from "../../services/validation/validationService";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";

function ChangePasswordFormComponent() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const passwordError =
    (submitAttempted || password !== "") && !validatePassword(password)
      ? t("components.changePasswordForm.passwordInvalid")
      : "";

  const confirmPasswordError =
    (submitAttempted || confirmPassword !== "") &&
    password !== confirmPassword
      ? t("components.changePasswordForm.passwordMismatch")
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
      setFormError(t("components.changePasswordForm.invalidSession"));
      return;
    }

    setIsSubmitting(true);
    try {
      const updatedUser = await changePassword(user.id, password);
      updateStoredUser(updatedUser);
      notifySuccess(t("components.changePasswordForm.updateSuccess"));
      navigate("/dashboard", { replace: true });
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : t("components.changePasswordForm.updateFailed"),
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
        label={t("components.changePasswordForm.newPasswordLabel")}
        placeholder={t("components.changePasswordForm.newPasswordPlaceholder")}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        autoComplete="new-password"
        required
        error={passwordError}
      />
      <InputComponent
        type="password"
        name="confirmPassword"
        label={t("components.changePasswordForm.confirmPasswordLabel")}
        placeholder={t("components.changePasswordForm.confirmPasswordPlaceholder")}
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
        {isSubmitting
          ? t("components.changePasswordForm.submitting")
          : t("components.changePasswordForm.submit")}
      </ButtonComponent>
    </form>
  );
}

export default ChangePasswordFormComponent;
