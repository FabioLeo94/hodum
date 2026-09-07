import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import InputComponent from "../input/inputComponent";
import ButtonComponent from "../button/buttonComponent";
import BackupHistoryItemComponent from "../backupHistoryItem/backupHistoryItemComponent";
import DeleteBackupModalComponent from "../deleteBackupModal/deleteBackupModalComponent";
import RestoreBackupModalComponent from "../restoreBackupModal/restoreBackupModalComponent";
import DrawerBaseComponent from "../drawerBase/drawerBaseComponent";
import NoticeComponent from "../notice/noticeComponent";
import {
  deleteBackup,
  getBackupSettings,
  listBackups,
  restoreBackup,
  runBackupNow,
  updateBackupSettings,
} from "../../services/backup/backupService";
import type { BackupRecord, BackupSettings } from "../../services/backup/backupService";
import { notifySuccess } from "../../services/notify/notifyService";
import { useAsyncSubmit } from "../../../shared/hooks/useAsyncSubmit";
import { formatDateTime } from "../../../shared/utils/formatDate";
import styles from "./backupSettingsDrawerComponent.module.css";

interface Prop {
  isOpen: boolean;
  onClose: () => void;
  companyId: string;
}

// Discriminata per tipo invece di due modali sempre montate con un booleano a
// testa: "quale backup" e "quale azione" sono sempre la stessa domanda,
// tenerli in un solo stato evita che i due possano disallinearsi (es. modal
// di ripristino aperta ma riferita al backup sbagliato).
type BackupActionModal =
  | { type: "delete" | "restore"; backup: BackupRecord }
  | { type: "bulk-delete"; count: number }
  | null;

// Form precompilato dal fetch (non da una prop "current*" come
// EditAccountModalComponent): qui il valore iniziale arriva da una chiamata
// di rete, non da uno stato già disponibile al chiamante, quindi il
// pattern "key sul mount" non basta da solo, serve un caricamento interno.
function BackupSettingsDrawerComponent({ isOpen, onClose, companyId }: Prop) {
  const { t } = useTranslation();

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
  const [actionModal, setActionModal] = useState<BackupActionModal>(null);
  const [actionError, setActionError] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { isSubmitting: isSaving, submit: submitSave } = useAsyncSubmit();
  const { isSubmitting: isRunning, submit: submitRun } = useAsyncSubmit();

  // Reset di selectedIds ad ogni apertura: aggiustato durante il render (non
  // in un effect) seguendo il pattern React per "resettare stato quando
  // cambia una prop" (https://react.dev/learn/you-might-not-need-an-effect),
  // dato che qui non dipende da nessuna lettura del DOM/rete, solo da isOpen.
  const [prevIsOpenForSelection, setPrevIsOpenForSelection] = useState(isOpen);
  if (isOpen !== prevIsOpenForSelection) {
    setPrevIsOpenForSelection(isOpen);
    if (isOpen) setSelectedIds(new Set());
  }

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
        setHistoryError(
          error instanceof Error ? error.message : t("components.backupSettingsDrawer.historyLoadError"),
        );
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
        setLoadError(
          error instanceof Error ? error.message : t("components.backupSettingsDrawer.loadError"),
        );
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
        setHistoryError(
          error instanceof Error ? error.message : t("components.backupSettingsDrawer.historyLoadError"),
        );
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, companyId, t]);

  const parsedInterval = Number(intervalMinutes);
  const intervalError =
    submitAttempted && (!Number.isInteger(parsedInterval) || parsedInterval < 1 || parsedInterval > 10_080)
      ? t("components.backupSettingsDrawer.intervalError")
      : "";

  const parsedMax = Number(maxBackups);
  const maxBackupsError =
    submitAttempted && (!Number.isInteger(parsedMax) || parsedMax < 1 || parsedMax > 500)
      ? t("components.backupSettingsDrawer.maxBackupsError")
      : "";

  const filenameFormatError =
    submitAttempted && filenameFormat.trim() === ""
      ? t("components.backupSettingsDrawer.filenameFormatError")
      : "";

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
        notifySuccess(t("components.backupSettingsDrawer.settings.saveSuccess"));
      } catch (error) {
        setSaveError(
          error instanceof Error ? error.message : t("components.backupSettingsDrawer.saveError"),
        );
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
        notifySuccess(t("components.backupSettingsDrawer.runNow.success"));
      } catch (error) {
        setRunError(
          error instanceof Error ? error.message : t("components.backupSettingsDrawer.runError"),
        );
        throw error;
      }
    });
  }

  function openDeleteBackupModal(backup: BackupRecord) {
    setActionError("");
    setActionModal({ type: "delete", backup });
  }

  function openRestoreBackupModal(backup: BackupRecord) {
    setActionError("");
    setActionModal({ type: "restore", backup });
  }

  function openBulkDeleteModal() {
    if (selectedIds.size === 0) return;
    setActionError("");
    setActionModal({ type: "bulk-delete", count: selectedIds.size });
  }

  function closeActionModal() {
    setActionModal(null);
  }

  function toggleBackupSelection(backup: BackupRecord) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(backup.id)) {
        next.delete(backup.id);
      } else {
        next.add(backup.id);
      }
      return next;
    });
  }

  // Stesso pattern di allIncluded/someIncluded in GenerateInvoiceDrawerComponent:
  // stato pieno/parziale/vuoto riflesso sulla checkbox nativa via checked/indeterminate.
  const allSelected = history.length > 0 && selectedIds.size === history.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  function toggleSelectAll() {
    setSelectedIds(allSelected ? new Set() : new Set(history.map((backup) => backup.id)));
  }

  // Niente rethrow (come ProjectComponent.handleDelete): l'errore resta nello
  // state actionError, il submit della modale (useAsyncSubmit) lo considera
  // comunque concluso e riabilita il bottone senza bisogno di propagarlo.
  async function handleConfirmDeleteBackup() {
    if (!actionModal || actionModal.type !== "delete") return;
    setActionError("");
    try {
      await deleteBackup(companyId, actionModal.backup.id);
      const deletedId = actionModal.backup.id;
      setActionModal(null);
      setSelectedIds((current) => {
        if (!current.has(deletedId)) return current;
        const next = new Set(current);
        next.delete(deletedId);
        return next;
      });
      loadHistory();
      notifySuccess(t("components.backupSettingsDrawer.deleteSuccess"));
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : t("components.backupSettingsDrawer.deleteError"),
      );
    }
  }

  // Nessun endpoint di bulk delete dedicato lato backend: si riusa
  // deleteBackup per ogni id selezionato. Promise.allSettled (non
  // Promise.all) perché con più richieste indipendenti un singolo fallimento
  // non deve nascondere gli altri successi: la history viene ricaricata
  // comunque, e solo gli id falliti restano selezionati per un nuovo
  // tentativo mirato.
  async function handleConfirmBulkDelete() {
    if (!actionModal || actionModal.type !== "bulk-delete") return;
    setActionError("");
    const ids = Array.from(selectedIds);
    const results = await Promise.allSettled(ids.map((backupId) => deleteBackup(companyId, backupId)));
    loadHistory();

    const failedIds = ids.filter((_, index) => results[index].status === "rejected");
    if (failedIds.length > 0) {
      setSelectedIds(new Set(failedIds));
      setActionModal({ type: "bulk-delete", count: failedIds.length });
      setActionError(
        failedIds.length === ids.length
          ? t("components.backupSettingsDrawer.bulkDeleteAllFailed")
          : t("components.backupSettingsDrawer.bulkDeletePartialFailed", {
              failed: failedIds.length,
              total: ids.length,
            }),
      );
      return;
    }

    setActionModal(null);
    setSelectedIds(new Set());
    notifySuccess(t("components.backupSettingsDrawer.bulkDeleteSuccess"));
  }

  // Il ripristino cambia anche last_backup_at (lo snapshot pre-restore creato
  // dal backend conta come un backup a tutti gli effetti): risincronizza
  // anche settings, non solo la history, altrimenti "Ultimo backup" nella
  // sezione "Esegui ora" resterebbe indietro finché il drawer non viene
  // riaperto.
  async function handleConfirmRestoreBackup() {
    if (!actionModal || actionModal.type !== "restore") return;
    setActionError("");
    try {
      await restoreBackup(companyId, actionModal.backup.id);
      setActionModal(null);
      loadHistory();
      const freshSettings = await getBackupSettings(companyId);
      applySettings(freshSettings);
      notifySuccess(t("components.backupSettingsDrawer.restoreSuccess"));
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : t("components.backupSettingsDrawer.restoreError"),
      );
    }
  }

  return (
    <>
      <DrawerBaseComponent
        isOpen={isOpen}
        onClose={onClose}
        title={t("components.backupSettingsDrawer.title")}
        closeLabel={t("components.backupSettingsDrawer.closeLabel")}
        scrollMode="panel"
        // Se una modale di conferma (elimina/applica backup) è aperta SOPRA
        // il drawer, il suo <dialog> nativo gestisce Escape per conto proprio
        // (onCancel in ModalBaseComponent, chiude solo la modale): senza
        // questa guardia lo stesso Escape chiuderebbe anche il drawer
        // sottostante, un effetto a cascata che l'utente non si aspetta
        // annullando solo la conferma.
        disableEscape={actionModal !== null}
      >
        {loadError ? (
          <p role="alert" className={styles.errorBanner}>
            {loadError}
          </p>
        ) : settings ? (
          <>
            <section className={styles.section}>
              <div className={styles.sectionHeaderRow}>
                <h3 className={styles.sectionTitle}>
                  {t("components.backupSettingsDrawer.runNow.sectionTitle")}
                </h3>
              </div>
              <p className={styles.hint}>
                {settings.lastBackupAt
                  ? t("components.backupSettingsDrawer.runNow.lastBackup", {
                      date: formatDateTime(settings.lastBackupAt),
                    })
                  : t("components.backupSettingsDrawer.runNow.never")}
              </p>
              <NoticeComponent
                variant="warning"
                text={t("components.backupSettingsDrawer.runNow.hint")}
              />
              <ButtonComponent onClick={handleRunNow} disabled={isRunning}>
                {isRunning
                  ? t("components.backupSettingsDrawer.runNow.running")
                  : t("components.backupSettingsDrawer.runNow.action")}
              </ButtonComponent>
              {runError && (
                <p role="alert" className={styles.errorBanner}>
                  {runError}
                </p>
              )}
            </section>

            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>
                {t("components.backupSettingsDrawer.settings.sectionTitle")}
              </h3>
              <div className={styles.fields}>
                <InputComponent
                  type="number"
                  name="intervalMinutes"
                  label={t("components.backupSettingsDrawer.settings.intervalLabel")}
                  value={intervalMinutes}
                  onChange={(event) => setIntervalMinutes(event.target.value)}
                  error={intervalError}
                  showLabel
                  required
                />
                <InputComponent
                  type="number"
                  name="maxBackups"
                  label={t("components.backupSettingsDrawer.settings.maxBackupsLabel")}
                  value={maxBackups}
                  onChange={(event) => setMaxBackups(event.target.value)}
                  error={maxBackupsError}
                  showLabel
                  required
                />
                <InputComponent
                  type="text"
                  name="filenameFormat"
                  label={t("components.backupSettingsDrawer.settings.filenameFormatLabel")}
                  value={filenameFormat}
                  onChange={(event) => setFilenameFormat(event.target.value)}
                  error={filenameFormatError}
                  showLabel
                  required
                />
                <p className={styles.hint}>
                  {t("components.backupSettingsDrawer.settings.placeholderHintPrefix")}{" "}
                  <code>{"{company}"}</code>, <code>{"{date}"}</code>, <code>{"{time}"}</code>,{" "}
                  <code>{"{index}"}</code>.
                </p>
              </div>
              <ButtonComponent onClick={handleSave} disabled={isSaving}>
                {isSaving
                  ? t("components.backupSettingsDrawer.settings.saving")
                  : t("components.backupSettingsDrawer.settings.save")}
              </ButtonComponent>
              {saveError && (
                <p role="alert" className={styles.errorBanner}>
                  {saveError}
                </p>
              )}
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHeaderRow}>
                <h3 className={styles.sectionTitle}>
                  {t("components.backupSettingsDrawer.history.sectionTitle")}
                </h3>
                {selectedIds.size > 0 && (
                  <div className={styles.selectionToolbar}>
                    <div className={styles.selectionStatus}>
                      <input
                        type="checkbox"
                        className={styles.selectAllCheckbox}
                        aria-label={t("components.backupSettingsDrawer.history.selectAllLabel")}
                        checked={allSelected}
                        ref={(element) => {
                          if (element) element.indeterminate = someSelected;
                        }}
                        onChange={toggleSelectAll}
                      />
                      <span className={styles.selectionCount}>
                        {t("components.backupSettingsDrawer.history.selectedCount", {
                          count: selectedIds.size,
                        })}
                      </span>
                    </div>
                    <button
                      type="button"
                      className={styles.cancelButton}
                      onClick={() => setSelectedIds(new Set())}
                    >
                      {t("components.backupSettingsDrawer.history.cancel")}
                    </button>
                    <ButtonComponent onClick={openBulkDeleteModal} variant="danger">
                      {t("components.backupSettingsDrawer.history.delete")}
                    </ButtonComponent>
                  </div>
                )}
              </div>
              {historyError ? (
                <p role="alert" className={styles.errorBanner}>
                  {historyError}
                </p>
              ) : history.length === 0 ? (
                <p className={styles.hint}>{t("components.backupSettingsDrawer.history.empty")}</p>
              ) : (
                <ul className={styles.historyList}>
                  {history.map((backup) => (
                    <BackupHistoryItemComponent
                      key={backup.id}
                      backup={backup}
                      selected={selectedIds.has(backup.id)}
                      onToggleSelect={toggleBackupSelection}
                      onRequestRestore={openRestoreBackupModal}
                      onRequestDelete={openDeleteBackupModal}
                    />
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : (
          <p className={styles.hint} role="status">
            {t("components.backupSettingsDrawer.loading")}
          </p>
        )}
      </DrawerBaseComponent>

      <DeleteBackupModalComponent
        isOpen={actionModal?.type === "delete" || actionModal?.type === "bulk-delete"}
        onClose={closeActionModal}
        backupFilename={actionModal?.type === "delete" ? actionModal.backup.filename : ""}
        count={actionModal?.type === "bulk-delete" ? actionModal.count : undefined}
        onConfirm={actionModal?.type === "bulk-delete" ? handleConfirmBulkDelete : handleConfirmDeleteBackup}
        submitError={actionError}
      />
      <RestoreBackupModalComponent
        isOpen={actionModal?.type === "restore"}
        onClose={closeActionModal}
        backupFilename={actionModal?.type === "restore" ? actionModal.backup.filename : ""}
        onConfirm={handleConfirmRestoreBackup}
        submitError={actionError}
      />
    </>
  );
}

export default BackupSettingsDrawerComponent;
