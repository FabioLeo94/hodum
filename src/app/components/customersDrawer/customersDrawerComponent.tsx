import { useEffect, useState } from "react";
import { ArrowLeft, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import InputComponent from "../input/inputComponent";
import TextareaComponent from "../textarea/textareaComponent";
import ButtonComponent from "../button/buttonComponent";
import RateInputComponent from "../rateInput/rateInputComponent";
import DrawerBaseComponent from "../drawerBase/drawerBaseComponent";
import DeleteCustomerModalComponent from "../deleteCustomerModal/deleteCustomerModalComponent";
import {
  createCustomer,
  deleteCustomer,
  getAllCustomers,
  updateCustomer,
} from "../../services/customer/customerService";
import { getCompany } from "../../services/company/companyService";
import type { Customer } from "../../../shared/types/customer";
import { useAsyncSubmit } from "../../../shared/hooks/useAsyncSubmit";
import { formatDate } from "../../../shared/utils/formatDate";
import type { RateUnit, WorkDays, WorkHours } from "../../../shared/utils/rateConversion";
import styles from "./customersDrawerComponent.module.css";

interface Prop {
  isOpen: boolean;
  onClose: () => void;
  companyId: string;
}

// Default "non configurato": usati finché il fetch di sola lettura della
// company (sotto) non risolve, o se fallisce. Il cliente non ha giorni/orari
// propri (vedi shared/types/customer.ts): finché lo schedule dell'azienda non
// è noto, RateInputComponent disabilita semplicemente le unità non orarie
// nella dropdown, un degrado silenzioso accettabile per un dato di sola
// convenienza di calcolo, non da bloccare con un proprio banner d'errore.
const EMPTY_WORK_DAYS: WorkDays = {
  lunedi: false,
  martedi: false,
  mercoledi: false,
  giovedi: false,
  venerdi: false,
  sabato: false,
  domenica: false,
};
const EMPTY_WORK_HOURS: WorkHours = {
  continuativo: true,
  inizio1: null,
  fine1: null,
  inizio2: null,
  fine2: null,
};

// Due "viste" invece di due rotte: lista e form vivono nello stesso drawer,
// una sola card alla volta occupa il pannello, la transizione è solo un
// translateX del contenitore .track (vedi CSS). customer: null nella vista
// form significa creazione, non modifica.
type View = { mode: "list" } | { mode: "form"; customer: Customer | null };

function viewKey(view: View): string {
  return view.mode === "list" ? "list" : `form:${view.customer?.id ?? "new"}`;
}

// Drawer raggiunto dalla card "Clienti" di companyManagement.tsx (owner-only,
// stesso scoping lato backend: tutti gli endpoint /customers richiedono
// @Security('owner')). Gli endpoint clienti scopano già sulla company del
// richiedente tramite il token, senza un :id nel path: companyId qui serve
// solo in lettura, per GET /companies/{id} (giorniLavorativi/orarioLavoro),
// necessari a RateInputComponent per convertire la tariffa cliente in unità
// diverse da quella oraria (il cliente non ha un proprio orario di lavoro).
function CustomersDrawerComponent({ isOpen, onClose, companyId }: Prop) {
  const { t } = useTranslation();

  const [view, setView] = useState<View>({ mode: "list" });
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [listError, setListError] = useState("");

  const [companyWorkDays, setCompanyWorkDays] = useState<WorkDays>(EMPTY_WORK_DAYS);
  const [companyWorkHours, setCompanyWorkHours] = useState<WorkHours>(EMPTY_WORK_HOURS);

  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formTariffaOraria, setFormTariffaOraria] = useState<number | null>(null);
  const [formTariffaUnita, setFormTariffaUnita] = useState<RateUnit | null>(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [saveError, setSaveError] = useState("");
  const { isSubmitting, submit } = useAsyncSubmit();

  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [deleteError, setDeleteError] = useState("");

  // Reset alla vista lista ad ogni (ri)apertura: aggiustato durante il
  // render (non in un effect), stesso pattern già usato da
  // EditCompanyDrawerComponent/BackupSettingsDrawerComponent per resettare
  // stato quando cambia isOpen.
  const [prevIsOpenForView, setPrevIsOpenForView] = useState(isOpen);
  if (isOpen !== prevIsOpenForView) {
    setPrevIsOpenForView(isOpen);
    if (isOpen) setView({ mode: "list" });
  }

  // Precompila il form quando la vista passa a "form" (creazione o modifica):
  // stessa idea "confronta col valore precedente durante il render" di sopra,
  // applicata qui al cambio di view invece che a isOpen.
  const currentViewKey = viewKey(view);
  const [prevViewKey, setPrevViewKey] = useState(currentViewKey);
  if (currentViewKey !== prevViewKey) {
    setPrevViewKey(currentViewKey);
    if (view.mode === "form") {
      setFormName(view.customer?.name ?? "");
      setFormDescription(view.customer?.description ?? "");
      setFormTariffaOraria(view.customer?.tariffaOraria ?? null);
      setFormTariffaUnita(view.customer?.tariffaUnita ?? null);
      setSubmitAttempted(false);
      setSaveError("");
    }
  }

  function loadCustomers() {
    getAllCustomers()
      .then((data) => {
        setCustomers(data);
        setListError("");
      })
      .catch((error: unknown) => {
        setListError(error instanceof Error ? error.message : t("components.customersDrawer.loadError"));
      });
  }

  // Ricaricato ad ogni apertura, non solo al mount: il drawer resta montato
  // in continuazione per l'animazione di chiusura (stesso pattern di
  // BackupSettingsDrawerComponent), quindi un fetch fresco riflette eventuali
  // modifiche fatte altrove nel frattempo.
  useEffect(() => {
    if (!isOpen) return;
    loadCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Sola lettura: giorniLavorativi/orarioLavoro dell'azienda servono solo al
  // calcolo di conversione dentro RateInputComponent, non vengono mostrati né
  // modificati qui. Nessun banner d'errore dedicato se il fetch fallisce: gli
  // stati EMPTY_WORK_DAYS/EMPTY_WORK_HOURS di fallback fanno semplicemente
  // apparire lo schedule come "non configurato" (RateInputComponent disabilita
  // le unità non orarie), un degrado accettabile per un dato di sola
  // convenienza rispetto a bloccare l'intero drawer clienti.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    getCompany(companyId)
      .then((loaded) => {
        if (cancelled || !loaded) return;
        setCompanyWorkDays(loaded.giorniLavorativi);
        setCompanyWorkHours(loaded.orarioLavoro);
      })
      .catch(() => {
        // vedi commento sopra: nessun errore da propagare, resta il fallback.
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, companyId]);

  function openCreateForm() {
    setView({ mode: "form", customer: null });
  }

  function openEditForm(customer: Customer) {
    setView({ mode: "form", customer });
  }

  function goBackToList() {
    setView({ mode: "list" });
  }

  // Escape torna alla lista quando si è nel form (stesso principio del
  // bottone "Indietro"), chiude l'intero drawer solo dalla vista lista.
  function handleEscape() {
    if (view.mode === "form") {
      goBackToList();
    } else {
      onClose();
    }
  }

  const editingCustomer = view.mode === "form" ? view.customer : null;
  const nameError =
    submitAttempted && formName.trim() === "" ? t("components.customersDrawer.nameRequired") : "";

  async function handleSave() {
    setSubmitAttempted(true);
    setSaveError("");

    const trimmedName = formName.trim();
    if (trimmedName === "") return;

    await submit(async () => {
      try {
        if (editingCustomer) {
          await updateCustomer(editingCustomer.id, {
            name: trimmedName,
            description: formDescription.trim() || null,
            tariffaOraria: formTariffaOraria,
            tariffaUnita: formTariffaUnita,
          });
        } else {
          await createCustomer({
            name: trimmedName,
            description: formDescription.trim() || null,
            tariffaOraria: formTariffaOraria,
            tariffaUnita: formTariffaUnita,
          });
        }
        setView({ mode: "list" });
        loadCustomers();
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : t("components.customersDrawer.saveError"));
        throw error;
      }
    });
  }

  function openDeleteModal(customer: Customer) {
    setDeleteError("");
    setDeleteTarget(customer);
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleteError("");
    try {
      await deleteCustomer(deleteTarget.id);
      setDeleteTarget(null);
      setView({ mode: "list" });
      loadCustomers();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : t("components.customersDrawer.deleteError"));
    }
  }

  return (
    <>
      <DrawerBaseComponent
        isOpen={isOpen}
        onClose={onClose}
        title={t("components.customersDrawer.title")}
        closeLabel={t("components.customersDrawer.closeLabel")}
        onEscape={handleEscape}
        disableEscape={deleteTarget !== null}
      >
        <div className={styles.viewport}>
          <div className={styles.track} data-view={view.mode}>
            <div className={styles.pane}>
              <div className={styles.listHeader}>
                <ButtonComponent onClick={openCreateForm}>
                  <Plus size={16} aria-hidden="true" />
                  {t("components.customersDrawer.newCustomer")}
                </ButtonComponent>
              </div>
              {listError ? (
                <p role="alert" className={styles.errorBanner}>
                  {listError}
                </p>
              ) : customers.length === 0 ? (
                <p className={styles.hint}>{t("components.customersDrawer.empty")}</p>
              ) : (
                <ul className={styles.customerList}>
                  {customers.map((customer) => (
                    <li key={customer.id}>
                      <button
                        type="button"
                        className={styles.customerCard}
                        onClick={() => openEditForm(customer)}
                      >
                        <span className={styles.customerName}>{customer.name}</span>
                        {customer.description && (
                          <span className={styles.customerDescription}>{customer.description}</span>
                        )}
                        <span className={styles.customerMeta}>
                          {t("components.customersDrawer.registeredOn", {
                            date: formatDate(customer.createdAt),
                          })}
                        </span>
                        <span className={styles.customerMeta}>
                          {customer.lastInvoicedAt
                            ? t("components.customersDrawer.lastInvoicedOn", {
                                date: formatDate(customer.lastInvoicedAt),
                              })
                            : t("components.customersDrawer.neverInvoiced")}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className={styles.pane}>
              <div className={styles.formHeader}>
                <button
                  type="button"
                  className={styles.backButton}
                  aria-label={t("components.customersDrawer.backLabel")}
                  onClick={goBackToList}
                >
                  <ArrowLeft size={18} aria-hidden="true" />
                </button>
                <h3 className={styles.formTitle}>
                  {editingCustomer
                    ? t("components.customersDrawer.editTitle")
                    : t("components.customersDrawer.createTitle")}
                </h3>
              </div>

              <div className={styles.fields}>
                <InputComponent
                  type="text"
                  name="name"
                  label={t("components.customersDrawer.nameLabel")}
                  value={formName}
                  onChange={(event) => setFormName(event.target.value)}
                  error={nameError}
                  showLabel
                  required
                />
                <TextareaComponent
                  name="description"
                  label={t("components.customersDrawer.descriptionLabel")}
                  value={formDescription}
                  onChange={(event) => setFormDescription(event.target.value)}
                  showLabel
                  rows={3}
                />
                <RateInputComponent
                  label={t("components.customersDrawer.rateLabel")}
                  name="tariffaOraria"
                  value={formTariffaOraria}
                  unit={formTariffaUnita}
                  workDays={companyWorkDays}
                  workHours={companyWorkHours}
                  onChange={(newValue, newUnit) => {
                    setFormTariffaOraria(newValue);
                    setFormTariffaUnita(newUnit);
                  }}
                />
                {editingCustomer && (
                  <p className={styles.hint}>
                    {t("components.customersDrawer.registeredOn", {
                      date: formatDate(editingCustomer.createdAt),
                    })}
                  </p>
                )}
                <p className={styles.hint}>
                  {editingCustomer?.lastInvoicedAt
                    ? t("components.customersDrawer.lastInvoicedOn", {
                        date: formatDate(editingCustomer.lastInvoicedAt),
                      })
                    : t("components.customersDrawer.neverInvoiced")}
                </p>
              </div>

              <ButtonComponent onClick={handleSave} disabled={isSubmitting}>
                {isSubmitting
                  ? t("components.customersDrawer.saving")
                  : t("components.customersDrawer.save")}
              </ButtonComponent>
              {saveError && (
                <p role="alert" className={styles.errorBanner}>
                  {saveError}
                </p>
              )}

              {editingCustomer && (
                <button
                  type="button"
                  className={styles.deleteLink}
                  onClick={() => openDeleteModal(editingCustomer)}
                >
                  {t("components.customersDrawer.delete")}
                </button>
              )}
            </div>
          </div>
        </div>
      </DrawerBaseComponent>

      <DeleteCustomerModalComponent
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        customerName={deleteTarget?.name ?? ""}
        onConfirm={handleConfirmDelete}
        submitError={deleteError}
      />
    </>
  );
}

export default CustomersDrawerComponent;
