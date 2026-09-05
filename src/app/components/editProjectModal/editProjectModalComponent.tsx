import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import ModalBaseComponent from "../modalBase/modalBaseComponent";
import InputComponent from "../input/inputComponent";
import ButtonComponent from "../button/buttonComponent";
import {
  listCustomerSummaries,
  type CustomerSummary,
} from "../../services/customer/customerService";
import { useAsyncSubmit } from "../../../shared/hooks/useAsyncSubmit";
import styles from "./editProjectModalComponent.module.css";

export interface EditProjectFormValues {
  name: string;
  // null = nessun cliente assegnato: il campo "cliente" di un progetto non è
  // obbligatorio, a differenza del nome.
  customerId: string | null;
}

interface Prop {
  isOpen: boolean;
  onClose: () => void;
  currentName: string;
  currentCustomerId: string | null;
  onSave: (values: EditProjectFormValues) => void | Promise<void>;
  submitError?: string;
}

// Value dell'<option> "Nessun cliente": una stringa vuota non collide mai con
// un uuid reale, evita di dover gestire un secondo stato "non selezionato"
// oltre a null.
const NO_CUSTOMER_VALUE = "";

function EditProjectModalComponent({
  isOpen,
  onClose,
  currentName,
  currentCustomerId,
  onSave,
  submitError,
}: Prop) {
  const { t } = useTranslation();
  const customerFieldId = useId();
  // Precompilati solo al mount di questa istanza: il chiamante rimonta il
  // componente (via `key`) ogni volta che la modale si riapre, così i valori
  // iniziali sono sempre quelli correnti senza un effect di risincronizzazione.
  const [name, setName] = useState(currentName);
  const [customerId, setCustomerId] = useState(currentCustomerId);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const { isSubmitting, submit } = useAsyncSubmit();

  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [customersError, setCustomersError] = useState("");

  // Ricaricata ad ogni apertura, non solo al mount: questo componente resta
  // montato in continuazione (stesso `key` trick di sopra sostituisce solo lo
  // state interno, non il mount), quindi un cliente creato nel frattempo
  // altrove (drawer di gestione aziendale) compare senza dover ricaricare la
  // pagina, stesso principio di CustomersDrawerComponent.
  useEffect(() => {
    if (!isOpen) return;
    listCustomerSummaries()
      .then((data) => {
        setCustomers(data);
        setCustomersError("");
      })
      .catch((error: unknown) => {
        setCustomersError(
          error instanceof Error
            ? error.message
            : t("components.editProjectModal.customersLoadError"),
        );
      });
  }, [isOpen, t]);

  const nameError =
    submitAttempted && name.trim() === ""
      ? t("components.editProjectModal.nameRequired")
      : "";

  function handleClose() {
    setSubmitAttempted(false);
    onClose();
  }

  async function handleSave() {
    setSubmitAttempted(true);
    const trimmedName = name.trim();
    if (trimmedName === "") return;

    await submit(async () => {
      await onSave({ name: trimmedName, customerId });
      setSubmitAttempted(false);
    });
  }

  return (
    <ModalBaseComponent
      isOpen={isOpen}
      onClose={handleClose}
      title={t("components.editProjectModal.title")}
      onSubmit={handleSave}
      primaryAction={
        <ButtonComponent onClick={() => {}} disabled={isSubmitting}>
          {isSubmitting
            ? t("components.editProjectModal.submitting")
            : t("components.editProjectModal.submit")}
        </ButtonComponent>
      }
      secondaryActions={
        <button
          type="button"
          className={styles.cancelButton}
          onClick={handleClose}
        >
          {t("components.editProjectModal.cancel")}
        </button>
      }
    >
      <InputComponent
        type="text"
        name="projectName"
        label={t("components.editProjectModal.nameLabel")}
        placeholder={t("components.editProjectModal.namePlaceholder")}
        value={name}
        onChange={(event) => setName(event.target.value)}
        autoComplete="off"
        autoFocus
        error={nameError}
        showLabel
      />
      <div className={styles.customerField}>
        <label className={styles.customerLabel} htmlFor={customerFieldId}>
          {t("components.editProjectModal.customerLabel")}
        </label>
        {/* Nessun cliente registrato in azienda: niente dropdown vuota, un
            avviso che indirizza dove crearli (customerId resta comunque null,
            l'unico valore possibile in questo caso). */}
        {customers.length === 0 && !customersError ? (
          <p className={styles.customerHint}>
            {t("components.editProjectModal.noCustomers")}
          </p>
        ) : (
          <select
            id={customerFieldId}
            className={styles.customerSelect}
            value={customerId ?? NO_CUSTOMER_VALUE}
            onChange={(event) =>
              setCustomerId(
                event.target.value === NO_CUSTOMER_VALUE ? null : event.target.value,
              )
            }
          >
            <option value={NO_CUSTOMER_VALUE}>
              {t("components.editProjectModal.noCustomerOption")}
            </option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
        )}
        {customersError && (
          <p role="alert" className={styles.customerHint}>
            {customersError}
          </p>
        )}
      </div>
      {submitError && (
        <p role="alert" className={styles.submitError}>
          {submitError}
        </p>
      )}
    </ModalBaseComponent>
  );
}

export default EditProjectModalComponent;
