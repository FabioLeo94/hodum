import { useState } from "react";
import ModalBaseComponent from "../modalBase/modalBaseComponent";
import InputComponent from "../input/inputComponent";
import ButtonComponent from "../button/buttonComponent";
import { validateEmail, validatePassword } from "../../services/validation/validationService";
import { useAsyncSubmit } from "../../../shared/hooks/useAsyncSubmit";
import { formatDate } from "../../../shared/utils/formatDate";
import styles from "./editAccountModalComponent.module.css";

export interface EditAccountFormValues {
  username: string;
  email: string;
  // Omesso quando l'utente non vuole cambiare la password: a differenza di
  // EditEmployeeModalComponent, qui è l'utente stesso a impostarla, quindi
  // must_change_password non va mai forzato di nuovo (vedi updateUser lato
  // backend, che lo forza solo quando isOwnerEditingEmployee).
  password?: string;
}

interface Prop {
  isOpen: boolean;
  onClose: () => void;
  currentUsername: string;
  currentEmail: string;
  currentCreatedAt: string;
  onSave: (values: EditAccountFormValues) => void | Promise<void>;
  submitError?: string;
}

function EditAccountModalComponent({
  isOpen,
  onClose,
  currentUsername,
  currentEmail,
  currentCreatedAt,
  onSave,
  submitError,
}: Prop) {
  // Precompilato solo al mount: il chiamante rimonta il componente (via
  // `key`) ogni volta che la modale si riapre, stesso pattern di
  // EditEmployeeModalComponent.
  const [username, setUsername] = useState(currentUsername);
  const [email, setEmail] = useState(currentEmail);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const { isSubmitting, submit } = useAsyncSubmit();

  const usernameError =
    submitAttempted && username.trim() === "" ? "Inserire uno username." : "";

  const emailError =
    (submitAttempted || email !== "") && !validateEmail(email)
      ? "Inserire una email valida."
      : "";

  // La password è opzionale: la validazione scatta solo se si è iniziato a
  // scriverne una nuova, stesso principio di EditEmployeeModalComponent.
  const passwordError =
    password !== "" && !validatePassword(password)
      ? "La password deve contenere almeno 8 caratteri, una minuscola, una maiuscola e un numero."
      : "";

  const confirmPasswordError =
    password !== "" &&
    (submitAttempted || confirmPassword !== "") &&
    password !== confirmPassword
      ? "Le password non coincidono."
      : "";

  function resetForm() {
    setUsername(currentUsername);
    setEmail(currentEmail);
    setPassword("");
    setConfirmPassword("");
    setSubmitAttempted(false);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  async function handleSave() {
    setSubmitAttempted(true);

    const trimmedUsername = username.trim();
    const isValid =
      trimmedUsername !== "" &&
      validateEmail(email) &&
      (password === "" || (validatePassword(password) && password === confirmPassword));

    if (!isValid) return;

    await submit(async () => {
      await onSave({
        username: trimmedUsername,
        email,
        password: password === "" ? undefined : password,
      });
      resetForm();
    });
  }

  return (
    <ModalBaseComponent
      isOpen={isOpen}
      onClose={handleClose}
      title="Modifica account"
      onSubmit={handleSave}
      primaryAction={
        <ButtonComponent onClick={() => {}} disabled={isSubmitting}>
          {isSubmitting ? "Salvataggio in corso..." : "Salva"}
        </ButtonComponent>
      }
      secondaryActions={
        <button type="button" className={styles.cancelButton} onClick={handleClose}>
          Annulla
        </button>
      }
    >
      <p className={styles.description}>
        Lascia vuoti i campi password per non cambiarla.
      </p>
      <div className={styles.metaInfo}>
        <p className={styles.metaRow}>
          <span className={styles.metaLabel}>Creato il</span>
          <span className={styles.metaValue}>{formatDate(currentCreatedAt)}</span>
        </p>
      </div>
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
          showLabel
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
          showLabel
        />
        <div className={styles.passwordGroup}>
          <InputComponent
            type="password"
            name="password"
            label="Nuova password"
            placeholder="Nuova password (opzionale)"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="off"
            error={passwordError}
            showLabel
          />
          <InputComponent
            type="password"
            name="confirmPassword"
            label="Conferma nuova password"
            placeholder="Conferma nuova password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="off"
            error={confirmPasswordError}
            showLabel
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

export default EditAccountModalComponent;
