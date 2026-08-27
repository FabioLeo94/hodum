import { useState } from "react";
import styles from "./authFormComponent.module.css";
import InputComponent from "../input/inputComponent";
import ButtonComponent from "../button/buttonComponent";
import { login, persistSession } from "../../services/auth/authService";
import { validateEmail } from "../../services/validation/validationService";
import { useNavigate } from "react-router";

function AuthFormComponent() {
  let navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [submitAttempted, setSubmitAttempted] = useState(false);
  console.log("AuthFormComponetn");

  const emailError =
    (submitAttempted || email !== "") && !validateEmail(email)
      ? "Inserire una email valida."
      : "";

  async function handleSubmit(event: React.SubmitEvent) {
    event.preventDefault();
    setPasswordError("");
    setSubmitAttempted(true);

    if (!validateEmail(email)) {
      return;
    }

    const success = await login(email, password);
    if (!success) {
      setPasswordError("Email o password non corretti.");
      return;
    }

    persistSession(rememberMe);
    navigate("/dashboard");
  }

  return (
    <form className={styles.authForm} onSubmit={handleSubmit} noValidate>
      <InputComponent
        type="email"
        name="email"
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
      <ButtonComponent onClick={() => {}}>Accedi</ButtonComponent>
    </form>
  );
}

export default AuthFormComponent;
