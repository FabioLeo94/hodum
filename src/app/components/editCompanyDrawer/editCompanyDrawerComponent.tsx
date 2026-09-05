import { useEffect, useId, useState } from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import InputComponent from "../input/inputComponent";
import ButtonComponent from "../button/buttonComponent";
import { getCompany, updateCompany } from "../../services/company/companyService";
import type { RegisteredCompany } from "../../services/company/companyService";
import { validateEmail } from "../../services/validation/validationService";
import { useAsyncSubmit } from "../../../shared/hooks/useAsyncSubmit";
import { formatDate } from "../../../shared/utils/formatDate";
import styles from "./editCompanyDrawerComponent.module.css";

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
  const titleId = useId();

  const [company, setCompany] = useState<RegisteredCompany | null>(null);
  const [loadError, setLoadError] = useState("");

  const [name, setName] = useState("");
  const [ragioneSociale, setRagioneSociale] = useState("");
  const [piva, setPiva] = useState("");
  const [codiceFiscale, setCodiceFiscale] = useState("");
  const [indirizzo, setIndirizzo] = useState("");
  const [pec, setPec] = useState("");
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

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

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
        });
        applyCompany(updated);
        setSubmitAttempted(false);
      } catch (error) {
        setSaveError(
          error instanceof Error ? error.message : t("components.editCompanyDrawer.saveError"),
        );
        throw error;
      }
    });
  }

  return (
    <>
      {isOpen && <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />}
      <div
        className={styles.panel}
        data-open={isOpen}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {t("components.editCompanyDrawer.title")}
          </h2>
          <button
            type="button"
            className={styles.closeButton}
            aria-label={t("components.editCompanyDrawer.closeLabel")}
            onClick={onClose}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {loadError ? (
          <p role="alert" className={styles.errorBanner}>
            {loadError}
          </p>
        ) : company ? (
          <section className={styles.section}>
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
      </div>
    </>
  );
}

export default EditCompanyDrawerComponent;
