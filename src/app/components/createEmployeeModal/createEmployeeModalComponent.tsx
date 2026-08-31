import { useState } from "react";
import ModalBaseComponent from "../modalBase/modalBaseComponent";
import InputComponent from "../input/inputComponent";
import ButtonComponent from "../button/buttonComponent";
import {
  validateEmail,
  validatePassword,
} from "../../services/validation/validationService";
import styles from "./createEmployeeModalComponent.module.css";

export interface CreateEmployeeFormValues {
  username: string;
  email: string;
  password: string;
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
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  function resetForm() {
    setUsername("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setSubmitAttempted(false);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  async function handleCreate() {
    if (isSubmitting) return;
    setSubmitAttempted(true);

    const isValid =
      username.trim() !== "" &&
      validateEmail(email) &&
      validatePassword(password) &&
      password === confirmPassword;

    if (!isValid) return;

    setIsSubmitting(true);
    try {
      await onCreate({ username: username.trim(), email, password });
      resetForm();
    } catch {
      // onCreate è responsabile di segnalare l'errore tramite submitError;
      // qui si intercetta solo per evitare una unhandled rejection e permettere il retry.
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ModalBaseComponent
      isOpen={isOpen}
      onClose={handleClose}
      title="Nuovo dipendente"
      onSubmit={handleCreate}
      primaryAction={
        <ButtonComponent onClick={() => {}} disabled={isSubmitting}>
          {isSubmitting ? "Creazione in corso..." : "Crea dipendente"}
        </ButtonComponent>
      }
      secondaryActions={
        <button
          type="button"
          className={styles.cancelButton}
          onClick={handleClose}
        >
          Annulla
        </button>
      }
    >
      <p className={styles.description}>
        La password iniziale va comunicata al dipendente: al primo accesso
        gli verrà chiesto di sostituirla con una scelta da lui.
      </p>
      <div className={styles.fields}>
        <InputComponent
          type="text"
          name="username"
          label="Username"
          placeholder="Username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="off"
          autoFocus
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
          autoComplete="off"
          required
          error={emailError}
        />
        {/* Password iniziale e conferma sono un'unica "risposta" divisa in due
            campi: un gap più stretto le lega visivamente tra loro, mentre lo
            spazio in più prima del gruppo (vedi .passwordGroup) le separa dai
            campi anagrafici sopra. */}
        <div className={styles.passwordGroup}>
          <InputComponent
            type="password"
            name="password"
            label="Password iniziale"
            placeholder="Password iniziale"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="off"
            required
            error={passwordError}
          />
          <InputComponent
            type="password"
            name="confirmPassword"
            label="Conferma password iniziale"
            placeholder="Conferma password iniziale"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="off"
            required
            error={confirmPasswordError}
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
