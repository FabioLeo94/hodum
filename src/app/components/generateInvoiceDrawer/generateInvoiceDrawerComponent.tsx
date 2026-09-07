import { Fragment, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import ButtonComponent from "../button/buttonComponent";
import DrawerBaseComponent from "../drawerBase/drawerBaseComponent";
import ElapsedDurationBadgeComponent from "../elapsedDurationBadge/elapsedDurationBadgeComponent";
import GenerateInvoicePreviewModalComponent from "../generateInvoicePreviewModal/generateInvoicePreviewModalComponent";
import { listCustomerSummaries } from "../../services/customer/customerService";
import type { CustomerSummary } from "../../services/customer/customerService";
import { listBillableTasks } from "../../services/invoice/invoiceService";
import type { TaskSelection } from "../../services/invoice/invoiceService";
import type { BillableTask } from "../../../shared/types/invoice";
import styles from "./generateInvoiceDrawerComponent.module.css";

interface Prop {
  isOpen: boolean;
  onClose: () => void;
  // Notifica il chiamante dopo una generazione riuscita, così la pagina
  // invoices.tsx può ricaricare la lista: il drawer si chiude da sé (vedi
  // handleConfirmed), non è responsabilità del chiamante.
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

  // "" = tutti i progetti del cliente (nessun filtro): l'opzione di default,
  // per non forzare una fattura per progetto quando l'utente ne vuole una
  // unica su più progetti.
  const [selectedProjectId, setSelectedProjectId] = useState("");

  const [includedIds, setIncludedIds] = useState<Set<string>>(new Set());
  const [nonFatturabileIds, setNonFatturabileIds] = useState<Set<string>>(new Set());

  // Selezione "congelata" al momento dell'apertura della preview (non
  // ricalcolata ad ogni render da includedIds/nonFatturabileIds): passata
  // così a GenerateInvoicePreviewModalComponent, la cui identità stabile
  // permette all'effect di caricamento PDF lì di dipendere direttamente da
  // taskSelections senza ricaricare ad ogni render del drawer.
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewSelections, setPreviewSelections] = useState<TaskSelection[]>([]);

  // Reset completo ad ogni (ri)apertura, aggiustato durante il render (non in
  // un effect): stesso pattern "confronta col valore precedente" già usato da
  // CustomersDrawerComponent per resettare stato quando cambia isOpen.
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setSelectedCustomerId("");
      setSelectedProjectId("");
      setCustomersError("");
      setIsPreviewOpen(false);
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
    setSelectedProjectId("");
    setTasks([]);
    setTasksError("");
    setIncludedIds(new Set());
    setNonFatturabileIds(new Set());
    setTasksLoading(selectedCustomerId !== "");
  }

  // Cambiare il filtro progetto invalida la selezione fatta finora, stesso
  // motivo del cambio cliente sopra: evita che task di un progetto restino
  // "inclusi" in modo invisibile mentre si guarda un altro progetto,
  // finendo per mischiarli nella stessa pre-fattura senza che sia voluto.
  const [prevSelectedProjectId, setPrevSelectedProjectId] = useState(selectedProjectId);
  if (selectedProjectId !== prevSelectedProjectId) {
    setPrevSelectedProjectId(selectedProjectId);
    setIncludedIds(new Set());
    setNonFatturabileIds(new Set());
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

  // Progetti distinti tra i task fatturabili del cliente, nell'ordine di
  // prima comparsa: popolano la select "Progetto" sotto, con "" (tutti i
  // progetti) come opzione aggiuntiva già gestita a parte nel JSX.
  const projectOptions = Array.from(new Map(tasks.map((task) => [task.projectId, task.projectName])), (
    [id, name],
  ) => ({ id, name }));

  // I task effettivamente mostrati/selezionabili: filtrati per progetto se
  // l'utente ne ha scelto uno, altrimenti tutti quelli del cliente.
  const visibleTasks =
    selectedProjectId === "" ? tasks : tasks.filter((task) => task.projectId === selectedProjectId);

  // Non tocca nonFatturabileIds: stessa scelta di toggleIncluded, che lascia
  // un task escluso nel set "non fatturabile" finché non viene ri-incluso
  // (la sua checkbox resta comunque disabled e ininfluente su handleOpenPreview).
  // Calcolati su visibleTasks (non su tasks): con un filtro progetto attivo,
  // "seleziona tutto" riguarda solo i task del progetto in vista.
  const allIncluded = visibleTasks.length > 0 && visibleTasks.every((task) => includedIds.has(task.id));
  const someIncluded = !allIncluded && visibleTasks.some((task) => includedIds.has(task.id));

  function toggleAllIncluded() {
    setIncludedIds(allIncluded ? new Set() : new Set(visibleTasks.map((task) => task.id)));
  }

  // Non genera più direttamente (spostato in GenerateInvoicePreviewModalComponent,
  // dietro il passaggio di anteprima): congela la selezione corrente e apre
  // la preview. Il drawer resta montato sotto, la generazione vera e propria
  // avviene solo alla conferma nella modale.
  function handleOpenPreview() {
    const taskSelections = tasks
      .filter((task) => includedIds.has(task.id))
      .map((task) => ({ taskId: task.id, nonFatturabile: nonFatturabileIds.has(task.id) }));
    if (taskSelections.length === 0 || selectedCustomerId === "") return;
    setPreviewSelections(taskSelections);
    setIsPreviewOpen(true);
  }

  function handleConfirmed() {
    setIsPreviewOpen(false);
    onClose();
    onGenerated();
  }

  const canGenerate = includedIds.size > 0;

  return (
    <Fragment>
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
                <Fragment>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>
                      {t("components.generateInvoiceDrawer.projectLabel")}
                    </span>
                    <select
                      className={styles.select}
                      value={selectedProjectId}
                      onChange={(event) => setSelectedProjectId(event.target.value)}
                    >
                      <option value="">
                        {t("components.generateInvoiceDrawer.allProjectsOption")}
                      </option>
                      {projectOptions.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  {visibleTasks.length === 0 ? (
                    <p className={styles.hint}>
                      {t("components.generateInvoiceDrawer.noBillableTasksForProject")}
                    </p>
                  ) : (
                    <table className={styles.tasksTable}>
                      <caption className={styles.srOnly}>
                        {t("components.generateInvoiceDrawer.tableCaption")}
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">
                            <input
                              type="checkbox"
                              className={styles.checkbox}
                              aria-label={t("components.generateInvoiceDrawer.selectAllLabel")}
                              checked={allIncluded}
                              ref={(element) => {
                                if (element) element.indeterminate = someIncluded;
                              }}
                              onChange={toggleAllIncluded}
                            />
                          </th>
                          <th scope="col">{t("components.generateInvoiceDrawer.columnTask")}</th>
                          <th scope="col">{t("components.generateInvoiceDrawer.columnProject")}</th>
                          <th scope="col">{t("components.generateInvoiceDrawer.columnWorkedTime")}</th>
                          <th scope="col">{t("components.generateInvoiceDrawer.columnNonBillable")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleTasks.map((task) => {
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
                              <td>
                                <ElapsedDurationBadgeComponent totalSeconds={task.workAccumulatedSeconds} />
                              </td>
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
                </Fragment>
              )}
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <ButtonComponent onClick={handleOpenPreview} disabled={!canGenerate}>
            {t("components.generateInvoiceDrawer.generate")}
          </ButtonComponent>
        </div>
      </DrawerBaseComponent>

      <GenerateInvoicePreviewModalComponent
        isOpen={isPreviewOpen}
        customerId={selectedCustomerId}
        taskSelections={previewSelections}
        onEdit={() => setIsPreviewOpen(false)}
        onConfirmed={handleConfirmed}
      />
    </Fragment>
  );
}

export default GenerateInvoiceDrawerComponent;
