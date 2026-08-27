import { useState } from "react";
import ModalBaseComponent from "../modalBase/modalBaseComponent";
import InputComponent from "../input/inputComponent";
import ButtonComponent from "../button/buttonComponent";
import styles from "./createProjectModalComponent.module.css";

interface Prop {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string) => void;
}

function CreateProjectModalComponent({ isOpen, onClose, onCreate }: Prop) {
  const [name, setName] = useState("");
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const nameError =
    submitAttempted && name.trim() === ""
      ? "Inserisci un nome per il progetto."
      : "";

  function handleClose() {
    setName("");
    setSubmitAttempted(false);
    onClose();
  }

  function handleCreate() {
    setSubmitAttempted(true);
    const trimmedName = name.trim();
    if (trimmedName === "") return;

    onCreate(trimmedName);
    setName("");
    setSubmitAttempted(false);
  }

  return (
    <ModalBaseComponent
      isOpen={isOpen}
      onClose={handleClose}
      title="Nuovo progetto"
      primaryAction={
        <ButtonComponent onClick={handleCreate}>
          Crea progetto
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
        placeholder="Es. Redesign sito web"
        value={name}
        onChange={(event) => setName(event.target.value)}
        autoComplete="off"
        autoFocus
        error={nameError}
      />
    </ModalBaseComponent>
  );
}

export default CreateProjectModalComponent;
