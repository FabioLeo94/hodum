import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import InputComponent from "../input/inputComponent";
import ButtonComponent from "../button/buttonComponent";
import RateInputComponent from "../rateInput/rateInputComponent";
import CurrencySelectComponent from "../currencySelect/currencySelectComponent";
import WorkDaysSelectorComponent from "../workDaysSelector/workDaysSelectorComponent";
import WorkHoursEditorComponent from "../workHoursEditor/workHoursEditorComponent";
import DrawerBaseComponent from "../drawerBase/drawerBaseComponent";
import { getCompany, updateCompany } from "../../services/company/companyService";
import type { RegisteredCompany } from "../../services/company/companyService";
import { notifySuccess } from "../../services/notify/notifyService";
import { validateEmail } from "../../services/validation/validationService";
import { useAsyncSubmit } from "../../../shared/hooks/useAsyncSubmit";
import { formatDate } from "../../../shared/utils/formatDate";
import type { CurrencyCode } from "../../../shared/utils/currency";
import type { RateUnit, WorkDays, WorkHours } from "../../../shared/utils/rateConversion";
import styles from "./editCompanyDrawerComponent.module.css";

// Stato "vuoto" usato solo prima che il primo fetch risolva: la sezione che
// li mostra è montata solo quando `company` è già valorizzato (vedi il ramo
// `company ? ... : loading` più sotto), quindi questi default non vengono mai
// renderizzati per davvero, servono solo a tipizzare lo state iniziale.
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

interface Prop {
  isOpen: boolean;
  onClose: () => void;
  companyId: string;
}

// Stesso standard di companyController.ts lato backend: qui replicato solo
// per dare un feedback immediato senza attendere la risposta 422, la
// validazione che conta resta comunque quella server-side.
const PIVA_REGEX = /^\d{11}$/;
const CODICE_FISCALE_REGEX = /^(\d{11}|[A-Za-z0-9]{16})$/;

// Form precompilato da un fetch interno (non da prop "current*"), stesso
// motivo di BackupSettingsDrawerComponent: il valore iniziale arriva da una
// chiamata di rete fatta ad ogni apertura, non da uno stato già disponibile
// al chiamante.
function EditCompanyDrawerComponent({ isOpen, onClose, companyId }: Prop) {
  const { t } = useTranslation();

  const [company, setCompany] = useState<RegisteredCompany | null>(null);
  const [loadError, setLoadError] = useState("");

  const [name, setName] = useState("");
  const [ragioneSociale, setRagioneSociale] = useState("");
  const [piva, setPiva] = useState("");
  const [codiceFiscale, setCodiceFiscale] = useState("");
  const [indirizzo, setIndirizzo] = useState("");
  const [pec, setPec] = useState("");
  const [tariffaOraria, setTariffaOraria] = useState<number | null>(null);
  const [tariffaUnita, setTariffaUnita] = useState<RateUnit | null>(null);
  const [valuta, setValuta] = useState<CurrencyCode>("EUR");
  const [giorniLavorativi, setGiorniLavorativi] = useState<WorkDays>(EMPTY_WORK_DAYS);
  const [orarioLavoro, setOrarioLavoro] = useState<WorkHours>(EMPTY_WORK_HOURS);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [saveError, setSaveError] = useState("");

  const { isSubmitting, submit } = useAsyncSubmit();

  // Reset di submitAttempted/saveError ad ogni apertura: aggiustato durante
  // il render (non in un effect) seguendo il pattern React per "resettare
  // stato quando cambia una prop" (https://react.dev/learn/you-might-not-need-an-effect),
  // dato che qui non dipende da nessuna lettura del DOM/rete, solo da isOpen.
  const [prevIsOpenForReset, setPrevIsOpenForReset] = useState(isOpen);
  if (isOpen !== prevIsOpenForReset) {
    setPrevIsOpenForReset(isOpen);
    if (isOpen) {
      setSubmitAttempted(false);
      setSaveError("");
    }
  }

  function applyCompany(loaded: RegisteredCompany) {
    setCompany(loaded);
    setName(loaded.name);
    setRagioneSociale(loaded.ragioneSociale ?? "");
    setPiva(loaded.piva ?? "");
    setCodiceFiscale(loaded.codiceFiscale ?? "");
    setIndirizzo(loaded.indirizzo ?? "");
    setPec(loaded.pec ?? "");
    setTariffaOraria(loaded.tariffaOraria);
    setTariffaUnita(loaded.tariffaUnita);
    setValuta(loaded.valuta);
    setGiorniLavorativi(loaded.giorniLavorativi);
    setOrarioLavoro(loaded.orarioLavoro);
  }

  // Ricaricato ad ogni apertura, non solo al mount: il drawer resta montato
  // in continuazione per l'animazione di chiusura (stesso pattern di
  // BackupSettingsDrawerComponent), quindi un fetch fresco riflette eventuali
  // modifiche fatte altrove nel frattempo.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    getCompany(companyId)
      .then((loaded) => {
        if (cancelled || !loaded) return;
        applyCompany(loaded);
        setLoadError("");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadError(
          error instanceof Error ? error.message : t("components.editCompanyDrawer.loadError"),
        );
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, companyId, t]);

  const nameError =
    submitAttempted && name.trim() === "" ? t("components.editCompanyDrawer.nameRequired") : "";

  const pivaError =
    submitAttempted && piva.trim() !== "" && !PIVA_REGEX.test(piva.trim())
      ? t("components.editCompanyDrawer.pivaInvalid")
      : "";

  const codiceFiscaleError =
    submitAttempted && codiceFiscale.trim() !== "" && !CODICE_FISCALE_REGEX.test(codiceFiscale.trim())
      ? t("components.editCompanyDrawer.codiceFiscaleInvalid")
      : "";

  const pecError =
    submitAttempted && pec.trim() !== "" && !validateEmail(pec.trim())
      ? t("components.editCompanyDrawer.pecInvalid")
      : "";

  async function handleSave() {
    setSubmitAttempted(true);
    setSaveError("");

    const trimmedName = name.trim();
    const trimmedPiva = piva.trim();
    const trimmedCodiceFiscale = codiceFiscale.trim();
    const trimmedPec = pec.trim();
    const isValid =
      trimmedName !== "" &&
      (trimmedPiva === "" || PIVA_REGEX.test(trimmedPiva)) &&
      (trimmedCodiceFiscale === "" || CODICE_FISCALE_REGEX.test(trimmedCodiceFiscale)) &&
      (trimmedPec === "" || validateEmail(trimmedPec));

    if (!isValid) return;

    await submit(async () => {
      try {
        const updated = await updateCompany(companyId, {
          name: trimmedName,
          ragioneSociale: ragioneSociale.trim() || null,
          piva: trimmedPiva || null,
          codiceFiscale: trimmedCodiceFiscale || null,
          indirizzo: indirizzo.trim() || null,
          pec: trimmedPec || null,
          tariffaOraria,
          tariffaUnita,
          valuta,
          giorniLavorativi,
          orarioLavoro,
        });
        applyCompany(updated);
        setSubmitAttempted(false);
        notifySuccess(t("components.editCompanyDrawer.saveSuccess"));
        onClose();
      } catch (error) {
        setSaveError(
          error instanceof Error ? error.message : t("components.editCompanyDrawer.saveError"),
        );
        throw error;
      }
    });
  }

  return (
    <DrawerBaseComponent
      isOpen={isOpen}
      onClose={onClose}
      title={t("components.editCompanyDrawer.title")}
      closeLabel={t("components.editCompanyDrawer.closeLabel")}
      scrollMode="panel"
    >
      {loadError ? (
        <p role="alert" className={styles.errorBanner}>
          {loadError}
        </p>
      ) : company ? (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>
            {t("components.editCompanyDrawer.companyDataSectionTitle")}
          </h3>
          <p className={styles.hint}>
            {t("components.editCompanyDrawer.createdOn", { date: formatDate(company.createdAt) })}
          </p>

          <div className={styles.fields}>
            <InputComponent
              type="text"
              name="name"
              label={t("components.editCompanyDrawer.nameLabel")}
              value={name}
              onChange={(event) => setName(event.target.value)}
              error={nameError}
              showLabel
              required
            />
            <InputComponent
              type="text"
              name="ragioneSociale"
              label={t("components.editCompanyDrawer.ragioneSocialeLabel")}
              value={ragioneSociale}
              onChange={(event) => setRagioneSociale(event.target.value)}
              showLabel
            />
            <InputComponent
              type="text"
              name="piva"
              label={t("components.editCompanyDrawer.pivaLabel")}
              value={piva}
              onChange={(event) => setPiva(event.target.value)}
              error={pivaError}
              showLabel
            />
            <InputComponent
              type="text"
              name="codiceFiscale"
              label={t("components.editCompanyDrawer.codiceFiscaleLabel")}
              value={codiceFiscale}
              onChange={(event) => setCodiceFiscale(event.target.value)}
              error={codiceFiscaleError}
              showLabel
            />
            <InputComponent
              type="text"
              name="indirizzo"
              label={t("components.editCompanyDrawer.indirizzoLabel")}
              value={indirizzo}
              onChange={(event) => setIndirizzo(event.target.value)}
              showLabel
            />
            <InputComponent
              type="email"
              name="pec"
              label={t("components.editCompanyDrawer.pecLabel")}
              value={pec}
              onChange={(event) => setPec(event.target.value)}
              error={pecError}
              showLabel
            />
          </div>

          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>
              {t("components.editCompanyDrawer.rateAndScheduleSectionTitle")}
            </h3>
            <RateInputComponent
              label={t("components.editCompanyDrawer.companyRateLabel")}
              name="tariffaOraria"
              value={tariffaOraria}
              unit={tariffaUnita}
              workDays={giorniLavorativi}
              workHours={orarioLavoro}
              onChange={(newValue, newUnit) => {
                setTariffaOraria(newValue);
                setTariffaUnita(newUnit);
              }}
            />
            <CurrencySelectComponent
              label={t("components.editCompanyDrawer.currencyLabel")}
              name="valuta"
              value={valuta}
              onChange={(newValue) => setValuta(newValue ?? "EUR")}
              required
            />
            <div>
              <p className={styles.fieldGroupLabel}>
                {t("components.editCompanyDrawer.workDaysLabel")}
              </p>
              <WorkDaysSelectorComponent value={giorniLavorativi} onChange={setGiorniLavorativi} />
            </div>
            <div>
              <p className={styles.fieldGroupLabel}>
                {t("components.editCompanyDrawer.workHoursLabel")}
              </p>
              <WorkHoursEditorComponent value={orarioLavoro} onChange={setOrarioLavoro} />
            </div>
          </div>

          <ButtonComponent onClick={handleSave} disabled={isSubmitting}>
            {isSubmitting
              ? t("components.editCompanyDrawer.submitting")
              : t("components.editCompanyDrawer.submit")}
          </ButtonComponent>
          {saveError && (
            <p role="alert" className={styles.errorBanner}>
              {saveError}
            </p>
          )}
        </section>
      ) : (
        <p className={styles.hint} role="status">
          {t("components.editCompanyDrawer.loading")}
        </p>
      )}
    </DrawerBaseComponent>
  );
}

export default EditCompanyDrawerComponent;
