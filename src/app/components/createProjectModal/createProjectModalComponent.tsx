import { useState } from "react";
import ModalBaseComponent from "../modalBase/modalBaseComponent";
import InputComponent from "../input/inputComponent";
import ButtonComponent from "../button/buttonComponent";
import { useAsyncSubmit } from "../../../shared/hooks/useAsyncSubmit";
import styles from "./createProjectModalComponent.module.css";

interface Prop {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string) => void | Promise<void>;
  submitError?: string;
}

function CreateProjectModalComponent({
  isOpen,
  onClose,
  onCreate,
  submitError,
}: Prop) {
  const [name, setName] = useState("");
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const { isSubmitting, submit } = useAsyncSubmit();

  const nameError =
    submitAttempted && name.trim() === ""
      ? "Inserisci un nome per il progetto."
      : "";

  function handleClose() {
    setName("");
    setSubmitAttempted(false);
    onClose();
  }

  async function handleCreate() {
    setSubmitAttempted(true);
    const trimmedName = name.trim();
    if (trimmedName === "") return;

    await submit(async () => {
      await onCreate(trimmedName);
      setName("");
      setSubmitAttempted(false);
    });
  }

  return (
    <ModalBaseComponent
      isOpen={isOpen}
      onClose={handleClose}
      title="Nuovo progetto"
      onSubmit={handleCreate}
      primaryAction={
        <ButtonComponent onClick={() => {}} disabled={isSubmitting}>
          {isSubmitting ? "Creazione in corso..." : "Crea progetto"}
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
        Dai un nome al progetto: potrai aggiungere i task in un secondo
        momento, dalla sua pagina dedicata.
      </p>
      <InputComponent
        type="text"
        name="projectName"
        label="Nome del progetto"
        placeholder="Es. Redesign sito web"
        value={name}
        onChange={(event) => setName(event.target.value)}
        autoComplete="off"
        autoFocus
        error={nameError}
        showLabel
      />
      {submitError && (
        <p role="alert" className={styles.submitError}>
          {submitError}
        </p>
      )}
    </ModalBaseComponent>
  );
}

export default CreateProjectModalComponent;
