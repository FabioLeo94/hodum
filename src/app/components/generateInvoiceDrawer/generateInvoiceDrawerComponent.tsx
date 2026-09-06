import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import ButtonComponent from "../button/buttonComponent";
import DrawerBaseComponent from "../drawerBase/drawerBaseComponent";
import { listCustomerSummaries } from "../../services/customer/customerService";
import type { CustomerSummary } from "../../services/customer/customerService";
import { generateInvoice, listBillableTasks } from "../../services/invoice/invoiceService";
import { notifySuccess } from "../../services/notify/notifyService";
import type { BillableTask } from "../../../shared/types/invoice";
import { useAsyncSubmit } from "../../../shared/hooks/useAsyncSubmit";
import { formatElapsedDuration } from "../../../shared/utils/formatElapsedDuration";
import styles from "./generateInvoiceDrawerComponent.module.css";

interface Prop {
  isOpen: boolean;
  onClose: () => void;
  // Notifica il chiamante dopo una generazione riuscita, così la pagina
  // invoices.tsx può ricaricare la lista: il drawer si chiude da sé (vedi
  // handleGenerate), non è responsabilità del chiamante.
  onGenerated: () => void;
}

function toggleInSet(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return next;
}

// Selezione cliente + tabella dei suoi task fatturabili, poi POST
// /customers/{id}/invoices. Riservato all'owner (backend @Security('owner')
// su ogni endpoint invoice): il chiamante (invoices.tsx) è già owner-only.
function GenerateInvoiceDrawerComponent({ isOpen, onClose, onGenerated }: Prop) {
  const { t } = useTranslation();

  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [customersError, setCustomersError] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");

  const [tasks, setTasks] = useState<BillableTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState("");

  const [includedIds, setIncludedIds] = useState<Set<string>>(new Set());
  const [nonFatturabileIds, setNonFatturabileIds] = useState<Set<string>>(new Set());

  const [submitError, setSubmitError] = useState("");
  const { isSubmitting, submit } = useAsyncSubmit();

  // Reset completo ad ogni (ri)apertura, aggiustato durante il render (non in
  // un effect): stesso pattern "confronta col valore precedente" già usato da
  // CustomersDrawerComponent per resettare stato quando cambia isOpen.
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setSelectedCustomerId("");
      setSubmitError("");
      setCustomersError("");
    }
  }

  // Cambiare cliente invalida la selezione di task fatta finora (i task
  // fatturabili appartengono al cliente precedente): reset sincrono durante
  // il render, stesso principio del blocco sopra. tasksLoading passa a true
  // qui (non nell'effect sotto, che lo farebbe sincronamente nel corpo
  // dell'effect, vietato dalla regola react-hooks/set-state-in-effect) così
  // la tabella mostra subito lo stato di caricamento per il nuovo cliente.
  const [prevSelectedCustomerId, setPrevSelectedCustomerId] = useState(selectedCustomerId);
  if (selectedCustomerId !== prevSelectedCustomerId) {
    setPrevSelectedCustomerId(selectedCustomerId);
    setTasks([]);
    setTasksError("");
    setIncludedIds(new Set());
    setNonFatturabileIds(new Set());
    setTasksLoading(selectedCustomerId !== "");
  }

  useEffect(() => {
    if (!isOpen) return;
    listCustomerSummaries()
      .then((data) => {
        setCustomers(data);
        setCustomersError("");
      })
      .catch((error: unknown) => {
        setCustomersError(
          error instanceof Error ? error.message : t("components.generateInvoiceDrawer.loadCustomersError"),
        );
      });
  }, [isOpen, t]);

  useEffect(() => {
    if (!isOpen || selectedCustomerId === "") return;
    let cancelled = false;

    listBillableTasks(selectedCustomerId)
      .then((data) => {
        if (!cancelled) {
          setTasks(data);
          setTasksError("");
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setTasksError(
            error instanceof Error ? error.message : t("components.generateInvoiceDrawer.loadTasksError"),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setTasksLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, selectedCustomerId, t]);

  function toggleIncluded(taskId: string) {
    setIncludedIds((current) => toggleInSet(current, taskId));
  }

  function toggleNonFatturabile(taskId: string) {
    setNonFatturabileIds((current) => toggleInSet(current, taskId));
  }

  async function handleGenerate() {
    setSubmitError("");
    const taskSelections = tasks
      .filter((task) => includedIds.has(task.id))
      .map((task) => ({ taskId: task.id, nonFatturabile: nonFatturabileIds.has(task.id) }));
    if (taskSelections.length === 0 || selectedCustomerId === "") return;

    await submit(async () => {
      try {
        await generateInvoice(selectedCustomerId, taskSelections);
        notifySuccess(t("components.generateInvoiceDrawer.generateSuccess"));
        onClose();
        onGenerated();
      } catch (error) {
        setSubmitError(
          error instanceof Error ? error.message : t("components.generateInvoiceDrawer.generateError"),
        );
        throw error;
      }
    });
  }

  const canGenerate = includedIds.size > 0 && !isSubmitting;

  return (
    <DrawerBaseComponent
      isOpen={isOpen}
      onClose={onClose}
      title={t("components.generateInvoiceDrawer.title")}
      closeLabel={t("components.generateInvoiceDrawer.closeLabel")}
      size="wide"
    >
      <div className={styles.content}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>{t("components.generateInvoiceDrawer.customerLabel")}</span>
          <select
            className={styles.select}
            value={selectedCustomerId}
            onChange={(event) => setSelectedCustomerId(event.target.value)}
          >
            <option value="">{t("components.generateInvoiceDrawer.selectCustomerPlaceholder")}</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
        </label>
        {customersError && (
          <p role="alert" className={styles.errorBanner}>
            {customersError}
          </p>
        )}

        {selectedCustomerId !== "" && (
          <div className={styles.tasksSection}>
            {tasksError ? (
              <p role="alert" className={styles.errorBanner}>
                {tasksError}
              </p>
            ) : tasksLoading ? (
              <p role="status" className={styles.hint}>
                {t("components.generateInvoiceDrawer.loadingTasks")}
              </p>
            ) : tasks.length === 0 ? (
              <p className={styles.hint}>{t("components.generateInvoiceDrawer.noBillableTasks")}</p>
            ) : (
              <table className={styles.tasksTable}>
                <caption className={styles.srOnly}>
                  {t("components.generateInvoiceDrawer.tableCaption")}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">
                      <span className={styles.srOnly}>
                        {t("components.generateInvoiceDrawer.columnInclude")}
                      </span>
                    </th>
                    <th scope="col">{t("components.generateInvoiceDrawer.columnTask")}</th>
                    <th scope="col">{t("components.generateInvoiceDrawer.columnProject")}</th>
                    <th scope="col">{t("components.generateInvoiceDrawer.columnHours")}</th>
                    <th scope="col">{t("components.generateInvoiceDrawer.columnNonBillable")}</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((task) => {
                    const included = includedIds.has(task.id);
                    return (
                      <tr key={task.id}>
                        <td>
                          <input
                            type="checkbox"
                            className={styles.checkbox}
                            aria-label={t("components.generateInvoiceDrawer.includeLabel", {
                              title: task.title,
                            })}
                            checked={included}
                            onChange={() => toggleIncluded(task.id)}
                          />
                        </td>
                        <td>{task.title}</td>
                        <td>{task.projectName}</td>
                        <td>{formatElapsedDuration(task.workAccumulatedSeconds)}</td>
                        <td>
                          <input
                            type="checkbox"
                            className={styles.checkbox}
                            aria-label={t("components.generateInvoiceDrawer.nonBillableLabel", {
                              title: task.title,
                            })}
                            checked={nonFatturabileIds.has(task.id)}
                            disabled={!included}
                            onChange={() => toggleNonFatturabile(task.id)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      <div className={styles.footer}>
        <ButtonComponent onClick={handleGenerate} disabled={!canGenerate}>
          {isSubmitting
            ? t("components.generateInvoiceDrawer.generating")
            : t("components.generateInvoiceDrawer.generate")}
        </ButtonComponent>
        {submitError && (
          <p role="alert" className={styles.errorBanner}>
            {submitError}
          </p>
        )}
      </div>
    </DrawerBaseComponent>
  );
}

export default GenerateInvoiceDrawerComponent;
