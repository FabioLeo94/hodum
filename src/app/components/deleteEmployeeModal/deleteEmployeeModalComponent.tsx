import ModalBaseComponent from "../modalBase/modalBaseComponent";
import ButtonComponent from "../button/buttonComponent";
import { useAsyncSubmit } from "../../../shared/hooks/useAsyncSubmit";
import styles from "./deleteEmployeeModalComponent.module.css";

interface Prop {
  isOpen: boolean;
  onClose: () => void;
  employeeUsername: string;
  onConfirm: () => void | Promise<void>;
  submitError?: string;
}

function DeleteEmployeeModalComponent({
  isOpen,
  onClose,
  employeeUsername,
  onConfirm,
  submitError,
}: Prop) {
  const { isSubmitting, submit } = useAsyncSubmit();

  async function handleConfirm() {
    await submit(async () => {
      await onConfirm();
    });
  }

  return (
    <ModalBaseComponent
      isOpen={isOpen}
      onClose={onClose}
      title="Elimina dipendente"
      variant="error"
      onSubmit={handleConfirm}
      primaryAction={
        <ButtonComponent
          onClick={() => {}}
          disabled={isSubmitting}
          variant="danger"
        >
          {isSubmitting ? "Eliminazione in corso..." : "Elimina"}
        </ButtonComponent>
      }
      secondaryActions={
        <button
          type="button"
          className={styles.cancelButton}
          onClick={onClose}
        >
          Annulla
        </button>
      }
    >
      <p className={styles.description}>
        Stai per eliminare «{employeeUsername}». L'operazione non è
        reversibile e rimuove anche le sue assegnazioni ai progetti.
      </p>
      {submitError && (
        <p role="alert" className={styles.submitError}>
          {submitError}
        </p>
      )}
    </ModalBaseComponent>
  );
}

export default DeleteEmployeeModalComponent;
