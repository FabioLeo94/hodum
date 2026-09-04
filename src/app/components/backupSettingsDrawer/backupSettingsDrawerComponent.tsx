import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import InputComponent from "../input/inputComponent";
import ButtonComponent from "../button/buttonComponent";
import {
  getBackupSettings,
  listBackups,
  runBackupNow,
  updateBackupSettings,
} from "../../services/backup/backupService";
import type { BackupRecord, BackupSettings } from "../../services/backup/backupService";
import { useAsyncSubmit } from "../../../shared/hooks/useAsyncSubmit";
import { formatDateTime } from "../../../shared/utils/formatDate";
import styles from "./backupSettingsDrawerComponent.module.css";

interface Prop {
  isOpen: boolean;
  onClose: () => void;
  companyId: string;
}

// Solo consumatore di questa formattazione (a differenza di formatDate.ts,
// condiviso da più punti): resta locale al componente finché non serve altrove.
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

// Form precompilato dal fetch (non da una prop "current*" come
// EditAccountModalComponent): qui il valore iniziale arriva da una chiamata
// di rete, non da uno stato già disponibile al chiamante, quindi il
// pattern "key sul mount" non basta da solo, serve un caricamento interno.
function BackupSettingsDrawerComponent({ isOpen, onClose, companyId }: Prop) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  const [settings, setSettings] = useState<BackupSettings | null>(null);
  const [loadError, setLoadError] = useState("");
  const [history, setHistory] = useState<BackupRecord[]>([]);
  const [historyError, setHistoryError] = useState("");

  const [intervalMinutes, setIntervalMinutes] = useState("15");
  const [maxBackups, setMaxBackups] = useState("25");
  const [filenameFormat, setFilenameFormat] = useState("{company}_{date}_{time}_{index}");
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [runError, setRunError] = useState("");

  const { isSubmitting: isSaving, submit: submitSave } = useAsyncSubmit();
  const { isSubmitting: isRunning, submit: submitRun } = useAsyncSubmit();

  function applySettings(loaded: BackupSettings) {
    setSettings(loaded);
    setIntervalMinutes(String(loaded.intervalMinutes));
    setMaxBackups(String(loaded.maxBackups));
    setFilenameFormat(loaded.filenameFormat);
  }

  function loadHistory() {
    listBackups(companyId)
      .then((data) => {
        setHistory(data);
        setHistoryError("");
      })
      .catch((error: unknown) => {
        setHistoryError(error instanceof Error ? error.message : "Impossibile caricare lo storico dei backup.");
      });
  }

  // Ricaricato ad ogni apertura (non solo al mount): il drawer resta montato
  // in continuazione (stesso pattern di assistantDrawerComponent, per
  // permettere l'animazione di chiusura), quindi un fetch fresco ad ogni
  // apertura riflette eventuali modifiche fatte altrove nel frattempo (es. un
  // backup schedulato scattato mentre il drawer era chiuso). Ogni setState è
  // dentro un .then/.catch (asincrono), mai in testa al corpo dell'effect:
  // gli eventuali banner di errore di save/run restano quelli dell'apertura
  // precedente finché l'utente non ritenta l'azione corrispondente, che li
  // sovrascrive comunque all'inizio di handleSave/handleRunNow.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    getBackupSettings(companyId)
      .then((loaded) => {
        if (cancelled) return;
        applySettings(loaded);
        setLoadError("");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : "Impossibile caricare le impostazioni di backup.");
      });

    // Stesso fetch di loadHistory (usata a parte da handleRunNow) ma inline:
    // includerla come funzione nelle dipendenze la ricreerebbe a ogni render
    // e farebbe rieseguire l'effect ad ogni render, non solo ad ogni apertura.
    listBackups(companyId)
      .then((data) => {
        if (cancelled) return;
        setHistory(data);
        setHistoryError("");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setHistoryError(error instanceof Error ? error.message : "Impossibile caricare lo storico dei backup.");
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

  const parsedInterval = Number(intervalMinutes);
  const intervalError =
    submitAttempted && (!Number.isInteger(parsedInterval) || parsedInterval < 1 || parsedInterval > 10_080)
      ? "Inserire un numero intero tra 1 e 10080 minuti (7 giorni)."
      : "";

  const parsedMax = Number(maxBackups);
  const maxBackupsError =
    submitAttempted && (!Number.isInteger(parsedMax) || parsedMax < 1 || parsedMax > 500)
      ? "Inserire un numero intero tra 1 e 500."
      : "";

  const filenameFormatError =
    submitAttempted && filenameFormat.trim() === "" ? "Il formato del nome file non può essere vuoto." : "";

  async function handleSave() {
    setSubmitAttempted(true);
    setSaveError("");

    if (
      !Number.isInteger(parsedInterval) ||
      parsedInterval < 1 ||
      parsedInterval > 10_080 ||
      !Number.isInteger(parsedMax) ||
      parsedMax < 1 ||
      parsedMax > 500 ||
      filenameFormat.trim() === ""
    ) {
      return;
    }

    await submitSave(async () => {
      try {
        const updated = await updateBackupSettings(companyId, {
          intervalMinutes: parsedInterval,
          maxBackups: parsedMax,
          filenameFormat: filenameFormat.trim(),
        });
        applySettings(updated);
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : "Impossibile salvare le impostazioni.");
        throw error;
      }
    });
  }

  // Esecuzione manuale: "resetta" il countdown dello scheduler lato backend
  // (vedi backupService.runScheduledBackups) semplicemente aggiornando
  // last_backup_at come farebbe un tick automatico. Qui basta ricaricare
  // settings + history dopo il successo per riflettere sia il nuovo
  // last_backup_at sia il file appena creato.
  async function handleRunNow() {
    setRunError("");
    await submitRun(async () => {
      try {
        await runBackupNow(companyId);
        const [freshSettings] = await Promise.all([getBackupSettings(companyId)]);
        applySettings(freshSettings);
        loadHistory();
      } catch (error) {
        setRunError(error instanceof Error ? error.message : "Esecuzione del backup non riuscita.");
        throw error;
      }
    });
  }

  return (
    <>
      {isOpen && <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />}
      <div
        ref={panelRef}
        className={styles.panel}
        data-open={isOpen}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            Backup
          </h2>
          <button type="button" className={styles.closeButton} aria-label="Chiudi" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {loadError ? (
          <p role="alert" className={styles.errorBanner}>
            {loadError}
          </p>
        ) : settings ? (
          <>
            <section className={styles.section}>
              <div className={styles.sectionHeaderRow}>
                <h3 className={styles.sectionTitle}>Esegui ora</h3>
              </div>
              <p className={styles.hint}>
                {settings.lastBackupAt
                  ? `Ultimo backup: ${formatDateTime(settings.lastBackupAt)}.`
                  : "Nessun backup eseguito finora."}{" "}
                Un'esecuzione manuale riazzera il conto alla rovescia del prossimo backup automatico.
              </p>
              <ButtonComponent onClick={handleRunNow} disabled={isRunning}>
                {isRunning ? "Backup in corso..." : "Esegui backup ora"}
              </ButtonComponent>
              {runError && (
                <p role="alert" className={styles.errorBanner}>
                  {runError}
                </p>
              )}
            </section>

            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Impostazioni</h3>
              <div className={styles.fields}>
                <InputComponent
                  type="number"
                  name="intervalMinutes"
                  label="Frequenza (minuti)"
                  value={intervalMinutes}
                  onChange={(event) => setIntervalMinutes(event.target.value)}
                  error={intervalError}
                  showLabel
                  required
                />
                <InputComponent
                  type="number"
                  name="maxBackups"
                  label="Backup massimi conservati"
                  value={maxBackups}
                  onChange={(event) => setMaxBackups(event.target.value)}
                  error={maxBackupsError}
                  showLabel
                  required
                />
                <InputComponent
                  type="text"
                  name="filenameFormat"
                  label="Formato nome file"
                  value={filenameFormat}
                  onChange={(event) => setFilenameFormat(event.target.value)}
                  error={filenameFormatError}
                  showLabel
                  required
                />
                <p className={styles.hint}>
                  Placeholder disponibili: <code>{"{company}"}</code>, <code>{"{date}"}</code>, <code>{"{time}"}</code>,{" "}
                  <code>{"{index}"}</code>.
                </p>
              </div>
              <ButtonComponent onClick={handleSave} disabled={isSaving}>
                {isSaving ? "Salvataggio in corso..." : "Salva impostazioni"}
              </ButtonComponent>
              {saveError && (
                <p role="alert" className={styles.errorBanner}>
                  {saveError}
                </p>
              )}
            </section>

            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Storico</h3>
              {historyError ? (
                <p role="alert" className={styles.errorBanner}>
                  {historyError}
                </p>
              ) : history.length === 0 ? (
                <p className={styles.hint}>Nessun backup ancora eseguito.</p>
              ) : (
                <ul className={styles.historyList}>
                  {history.map((backup) => (
                    <li key={backup.id} className={styles.historyItem}>
                      <div className={styles.historyMain}>
                        <span className={styles.historyFilename} title={backup.filename}>
                          {backup.filename}
                        </span>
                        <span className={styles.historyMeta}>
                          {formatDateTime(backup.createdAt)} · {formatFileSize(backup.sizeBytes)}
                        </span>
                      </div>
                      <span className={styles.historyBadge} data-trigger={backup.triggeredBy}>
                        {backup.triggeredBy === "manual" ? "Manuale" : "Automatico"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : (
          <p className={styles.hint} role="status">
            Caricamento...
          </p>
        )}
      </div>
    </>
  );
}

export default BackupSettingsDrawerComponent;
