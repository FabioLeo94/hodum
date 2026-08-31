import { useState } from "react";
import ModalBaseComponent from "../modalBase/modalBaseComponent";
import InputComponent from "../input/inputComponent";
import ButtonComponent from "../button/buttonComponent";
import { validatePassword } from "../../services/validation/validationService";
import styles from "./editEmployeeModalComponent.module.css";

export interface EditEmployeeFormValues {
  username: string;
  // Omesso quando l'owner non vuole cambiare la password: distinto da una
  // stringa vuota, che invece verrebbe rifiutata dalla validazione.
  password?: string;
}

interface Prop {
  isOpen: boolean;
  onClose: () => void;
  currentUsername: string;
  onSave: (values: EditEmployeeFormValues) => void | Promise<void>;
  submitError?: string;
}

function EditEmployeeModalComponent({
  isOpen,
  onClose,
  currentUsername,
  onSave,
  submitError,
}: Prop) {
  // Precompilato solo al mount: il chiamante rimonta il componente (via
  // `key`) ogni volta che la modale si riapre, stesso pattern di
  // RenameProjectModalComponent.
  const [username, setUsername] = useState(currentUsername);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const usernameError =
    submitAttempted && username.trim() === "" ? "Inserire uno username." : "";

  // La password è opzionale: la validazione scatta solo se l'owner ha
  // iniziato a scriverne una, stesso principio già usato in
  // CreateEmployeeModalComponent per email/password (validazione "a partire
  // dal primo carattere", non solo al submit).
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
    setPassword("");
    setConfirmPassword("");
    setSubmitAttempted(false);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  async function handleSave() {
    if (isSubmitting) return;
    setSubmitAttempted(true);

    const trimmedUsername = username.trim();
    const isValid =
      trimmedUsername !== "" &&
      (password === "" || (validatePassword(password) && password === confirmPassword));

    if (!isValid) return;

    setIsSubmitting(true);
    try {
      await onSave({
        username: trimmedUsername,
        password: password === "" ? undefined : password,
      });
      resetForm();
    } catch {
      // onSave è responsabile di segnalare l'errore tramite submitError;
      // qui si intercetta solo per evitare una unhandled rejection e permettere il retry.
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ModalBaseComponent
      isOpen={isOpen}
      onClose={handleClose}
      title="Modifica dipendente"
      onSubmit={handleSave}
      primaryAction={
        <ButtonComponent onClick={() => {}} disabled={isSubmitting}>
          {isSubmitting ? "Salvataggio in corso..." : "Salva"}
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
        Lascia vuoti i campi password per non cambiarla. Una nuova password
        andrà comunicata al dipendente: al prossimo accesso gli verrà chiesto
        di sostituirla con una scelta da lui.
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

export default EditEmployeeModalComponent;
