import { useEffect, useId, useState } from "react";
import { X } from "lucide-react";
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
    setSubmitAttempted(false);
    setSaveError("");

    getCompany(companyId)
      .then((loaded) => {
        if (cancelled || !loaded) return;
        applyCompany(loaded);
        setLoadError("");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : "Impossibile caricare i dati aziendali.");
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, companyId]);

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const nameError = submitAttempted && name.trim() === "" ? "Il nome dell'azienda non può essere vuoto." : "";

  const pivaError =
    submitAttempted && piva.trim() !== "" && !PIVA_REGEX.test(piva.trim())
      ? "La P.IVA deve essere composta da 11 cifre."
      : "";

  const codiceFiscaleError =
    submitAttempted && codiceFiscale.trim() !== "" && !CODICE_FISCALE_REGEX.test(codiceFiscale.trim())
      ? "Il codice fiscale deve essere di 11 cifre o 16 caratteri alfanumerici."
      : "";

  const pecError =
    submitAttempted && pec.trim() !== "" && !validateEmail(pec.trim()) ? "Inserire una PEC valida." : "";

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
        setSaveError(error instanceof Error ? error.message : "Impossibile salvare i dati aziendali.");
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
            Modifica dati aziendali
          </h2>
          <button type="button" className={styles.closeButton} aria-label="Chiudi" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {loadError ? (
          <p role="alert" className={styles.errorBanner}>
            {loadError}
          </p>
        ) : company ? (
          <section className={styles.section}>
            <p className={styles.hint}>Creata il {formatDate(company.createdAt)}.</p>

            <div className={styles.fields}>
              <InputComponent
                type="text"
                name="name"
                label="Nome azienda"
                value={name}
                onChange={(event) => setName(event.target.value)}
                error={nameError}
                showLabel
                required
              />
              <InputComponent
                type="text"
                name="ragioneSociale"
                label="Ragione sociale"
                value={ragioneSociale}
                onChange={(event) => setRagioneSociale(event.target.value)}
                showLabel
              />
              <InputComponent
                type="text"
                name="piva"
                label="Partita IVA"
                value={piva}
                onChange={(event) => setPiva(event.target.value)}
                error={pivaError}
                showLabel
              />
              <InputComponent
                type="text"
                name="codiceFiscale"
                label="Codice fiscale"
                value={codiceFiscale}
                onChange={(event) => setCodiceFiscale(event.target.value)}
                error={codiceFiscaleError}
                showLabel
              />
              <InputComponent
                type="text"
                name="indirizzo"
                label="Indirizzo"
                value={indirizzo}
                onChange={(event) => setIndirizzo(event.target.value)}
                showLabel
              />
              <InputComponent
                type="email"
                name="pec"
                label="PEC"
                value={pec}
                onChange={(event) => setPec(event.target.value)}
                error={pecError}
                showLabel
              />
            </div>

            <ButtonComponent onClick={handleSave} disabled={isSubmitting}>
              {isSubmitting ? "Salvataggio in corso..." : "Salva"}
            </ButtonComponent>
            {saveError && (
              <p role="alert" className={styles.errorBanner}>
                {saveError}
              </p>
            )}
          </section>
        ) : (
          <p className={styles.hint} role="status">
            Caricamento...
          </p>
        )}
      </div>
    </>
  );
}

export default EditCompanyDrawerComponent;
