import { useState, type FormEvent } from "react";
import "./authFormComponent.css";
import InputComponent from "../input/inputComponent";
import ButtonComponent from "../button/buttonComponent";
import { login, persistSession } from "../../services/auth/authService";
import { validateEmail } from "../../services/validation/validationService";

function AuthFormComponent() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!validateEmail(email)) {
      setError("Inserisci un indirizzo email valido.");
      return;
    }

    const success = await login(email, password);
    if (!success) {
      setError("Email o password non corretti.");
      return;
    }

    persistSession(rememberMe);
  }

  return (
    <form className="authForm" onSubmit={handleSubmit} noValidate>
      <InputComponent
        type="email"
        name="email"
        placeholder="Email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        autoComplete="email"
        required
      />
      <InputComponent
        type="password"
        name="password"
        placeholder="Password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        autoComplete="current-password"
        required
      />
      <label className="authRememberMe">
        <input
          className="authCheckbox"
          type="checkbox"
          checked={rememberMe}
          onChange={(event) => setRememberMe(event.target.checked)}
        />
        Resta connesso
      </label>
      {error && <p className="authError">{error}</p>}
      <ButtonComponent onClick={() => {}}>Accedi</ButtonComponent>
    </form>
  );
}

export default AuthFormComponent;
