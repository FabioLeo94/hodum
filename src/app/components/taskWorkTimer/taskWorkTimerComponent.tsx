import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Pause, Pencil, Play, Square, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TaskStatus, WorkTimerAction } from "../../../shared/types/project";
import {
  decomposeElapsedDuration,
  type ElapsedDurationSegments,
} from "../../../shared/utils/decomposeElapsedDuration";
import styles from "./taskWorkTimerComponent.module.css";

// Ogni segmento a due cifre: sempre presente (anche a "00"), l'attenuazione
// visiva dei segmenti a zero è affidata a .segmentMuted (vedi CSS), non alla
// loro assenza. Nessun padding testuale dal valore grezzo qui: lo fa questa
// funzione, decomposeElapsedDuration resta pura e senza formattazione.
const pad = (value: number) => String(value).padStart(2, "0");

// Stesso range accettato dal backend (PATCH .../work-timer/elapsed-seconds):
// 99gg 23:59:59 = 8639999 secondi, spalmati sui 4 segmenti dell'editor.
const SEGMENT_LIMITS = { days: 99, hours: 23, minutes: 59, seconds: 59 } as const;
type SegmentKey = keyof typeof SEGMENT_LIMITS;
// labelKey resta l'aria-label completo già esistente (invariato: i test lo
// individuano per nome accessibile esatto, es. /^ore$/i). shortLabelKey è
// solo la didascalia visiva ("gg"/"hh"/"mm"/"ss") sotto ogni campo, marcata
// aria-hidden nel JSX: non deve raddoppiare l'annuncio dello screen reader
// già coperto dall'aria-label.
const SEGMENT_FIELDS: { key: SegmentKey; labelKey: string; shortLabelKey: string }[] = [
  {
    key: "days",
    labelKey: "components.taskWorkTimer.daysFieldLabel",
    shortLabelKey: "components.taskWorkTimer.daysFieldShortLabel",
  },
  {
    key: "hours",
    labelKey: "components.taskWorkTimer.hoursFieldLabel",
    shortLabelKey: "components.taskWorkTimer.hoursFieldShortLabel",
  },
  {
    key: "minutes",
    labelKey: "components.taskWorkTimer.minutesFieldLabel",
    shortLabelKey: "components.taskWorkTimer.minutesFieldShortLabel",
  },
  {
    key: "seconds",
    labelKey: "components.taskWorkTimer.secondsFieldLabel",
    shortLabelKey: "components.taskWorkTimer.secondsFieldShortLabel",
  },
];

function clampSegment(key: SegmentKey, value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(SEGMENT_LIMITS[key], Math.max(0, Math.floor(value)));
}

interface Prop {
  status: TaskStatus;
  taskTitle: string;
  workStartedAt: string | null;
  workAccumulatedSeconds: number;
  workEndedAt: string | null;
  onAction: (action: WorkTimerAction) => void;
  /** Correzione manuale del tempo accumulato (l'utente si è dimenticato di
   * avviare/fermare il timer): riceve il totale in secondi già ricomposto
   * dai 4 segmenti dell'editor, stesso range 0-8639999 validato dal backend. */
  onElapsedTimeEdit: (totalSeconds: number) => void;
  /** Nasconde i controlli (play/pausa/stop/reset), lasciando solo il tempo
   * accumulato in sola lettura: usato per un task fatturato (vedi
   * Task.invoiceId), che il backend rifiuta comunque di modificare con 409,
   * quindi qui si previene l'azione invece di limitarsi a gestirne l'errore. */
  disabled?: boolean;
}

// I bottoni compaiono solo su un task ancora aperto (progress/review): su
// completed/rejected il timer è già stato chiuso automaticamente lato
// backend (vedi updateTaskStatus in taskService.ts) e resta solo da mostrare
// il tempo congelato, senza controlli che non avrebbero più effetto.
function TaskWorkTimerComponent({
  status,
  taskTitle,
  workStartedAt,
  workAccumulatedSeconds,
  workEndedAt,
  onAction,
  onElapsedTimeEdit,
  disabled = false,
}: Prop) {
  const { t } = useTranslation();
  const isRunning = workStartedAt !== null;
  const isActiveStatus = status === "progress" || status === "review";
  const hasProgress = isRunning || workAccumulatedSeconds > 0 || workEndedAt !== null;

  // Date.now() è una funzione impura: non può essere chiamata durante il
  // render (regola react-hooks/purity), e chiamare setState in modo
  // sincrono dentro il corpo di un effect è a sua volta vietato (regola
  // react-hooks/set-state-in-effect, vedi il pattern setTimeout
  // auto-riprogrammato di authFormComponent.tsx per lo stesso principio).
  // runningElapsedSeconds vive quindi SOLO dentro il callback asincrono di
  // setInterval, mai chiamato in modo sincrono nell'effect; il reset a 0
  // quando parte una nuova sessione (o il timer si ferma) passa invece dal
  // pattern "confronta col valore precedente durante il render" già usato da
  // EditCompanyDrawerComponent/BackupSettingsDrawerComponent per resettare
  // stato al cambio di una prop.
  const [runningElapsedSeconds, setRunningElapsedSeconds] = useState(0);
  const [prevWorkStartedAt, setPrevWorkStartedAt] = useState(workStartedAt);
  if (workStartedAt !== prevWorkStartedAt) {
    setPrevWorkStartedAt(workStartedAt);
    setRunningElapsedSeconds(0);
  }

  useEffect(() => {
    if (!isRunning) return;
    const startedMs = new Date(workStartedAt as string).getTime();
    const interval = setInterval(() => {
      setRunningElapsedSeconds(Math.max(0, (Date.now() - startedMs) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isRunning, workStartedAt]);

  const displaySeconds = workAccumulatedSeconds + (isRunning ? runningElapsedSeconds : 0);
  const { days, hours, minutes, seconds } = decomposeElapsedDuration(displaySeconds);
  // Segmento "presente ma secondario" a valore zero: stesso linguaggio
  // visivo di opacità già usato per un dato meno rilevante nel contesto
  // corrente (vedi .dot[data-dimmed] in taskCalendarComponent.module.css),
  // non un pattern nuovo. Un segmento resta sempre leggibile: solo
  // l'enfasi cambia, mai la sua presenza.
  const segmentClassName = (value: number) =>
    value > 0 ? styles.segment : `${styles.segment} ${styles.segmentMuted}`;

  const showPlay = !disabled && isActiveStatus && !isRunning;
  const showPause = !disabled && isActiveStatus && isRunning;
  const showStop = !disabled && isActiveStatus && (isRunning || (hasProgress && workEndedAt === null));
  const showReset = !disabled && isActiveStatus && hasProgress;

  // Editor manuale del tempo accumulato: separato dai controlli play/pausa/
  // stop/reset sopra perché resta disponibile anche su un task già chiuso
  // (completed/rejected, non ancora fatturato) — l'utente può essersi
  // dimenticato di avviare/fermare il timer anche lì, non solo su un task
  // ancora aperto.
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [draft, setDraft] = useState<ElapsedDurationSegments>({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const editPanelRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const editPanelId = useId();

  // Il valore precompilato è quello mostrato ORA (displaySeconds, comprende
  // il segmento in corso se il timer sta girando), congelato nel momento del
  // click: draft non insegue più displaySeconds dopo l'apertura, altrimenti
  // il popover cambierebbe sotto le dita dell'utente mentre lo sta correggendo.
  function handleOpenEdit() {
    setDraft({ days, hours, minutes, seconds });
    setIsEditOpen(true);
  }

  function handleDraftChange(key: SegmentKey, rawValue: string) {
    const digitsOnly = rawValue.replace(/\D/g, "").slice(-2);
    setDraft((prev) => ({ ...prev, [key]: digitsOnly === "" ? 0 : Number(digitsOnly) }));
  }

  function handleDraftBlur(key: SegmentKey) {
    setDraft((prev) => ({ ...prev, [key]: clampSegment(key, prev[key]) }));
  }

  function handleSaveEdit() {
    // Clamp difensivo anche qui: un Invio da tastiera può innescare il
    // submit del form prima che l'onBlur del campo ancora a fuoco sia scattato.
    const totalSeconds =
      clampSegment("days", draft.days) * 86400 +
      clampSegment("hours", draft.hours) * 3600 +
      clampSegment("minutes", draft.minutes) * 60 +
      clampSegment("seconds", draft.seconds);
    onElapsedTimeEdit(totalSeconds);
    setIsEditOpen(false);
  }

  function handleCancelEdit() {
    setIsEditOpen(false);
  }

  // Stesso pattern di dismiss/focus di NotificationBellComponent: pannello in
  // portal, quindi un click "dentro" va riconosciuto anche lì, non solo
  // dentro il bottone trigger.
  useEffect(() => {
    if (!isEditOpen) return;

    firstFieldRef.current?.focus();
    firstFieldRef.current?.select();

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (
        editButtonRef.current?.contains(target) ||
        editPanelRef.current?.contains(target)
      ) {
        return;
      }
      setIsEditOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsEditOpen(false);
        editButtonRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isEditOpen]);

  // Posizionamento via portal su document.body: il trigger vive in una cella
  // di tabella o in una card kanban, entrambi contenitori che possono avere
  // overflow/scroll e taglierebbero un popover posizionato in modo relativo.
  useLayoutEffect(() => {
    if (!isEditOpen) return;

    function reposition() {
      const button = editButtonRef.current;
      const panel = editPanelRef.current;
      if (!button || !panel) return;
      const rect = button.getBoundingClientRect();
      panel.style.top = `${rect.bottom + 8}px`;
      panel.style.left = `${rect.left}px`;
    }

    reposition();
    window.addEventListener("resize", reposition);
    return () => window.removeEventListener("resize", reposition);
  }, [isEditOpen]);

  return (
    <div className={styles.timer}>
      <div className={styles.timerRow}>
        {/* role="timer" (WAI-ARIA "widget di conteggio numerico del tempo
            trascorso") è la semantica corretta per questo blocco, non solo
            una scelta comoda per i test: comunica esplicitamente a chi usa
            uno screen reader che il valore è un cronometro, non testo
            generico. aria-live resta condizionato all'esecuzione, come
            prima, per non generare annunci quando il timer è fermo. I ":"
            sono aria-hidden: non sono cifre, leggerli ad alta voce non
            aggiunge informazione. Il distacco visivo tra giorni e ore è un
            margin CSS su .daySegment, non uno spazio testuale: un elemento
            fatto di solo spazio bianco viene azzerato dal browser (il testo
            "00 00:00:07" appariva come "0000:00:07"), un margin no. */}
        <span className={styles.time} role="timer" aria-live={isRunning ? "polite" : undefined}>
          <span className={`${segmentClassName(days)} ${styles.daySegment}`}>{pad(days)}</span>
          <span className={segmentClassName(hours)}>{pad(hours)}</span>
          <span aria-hidden="true">:</span>
          <span className={segmentClassName(minutes)}>{pad(minutes)}</span>
          <span aria-hidden="true">:</span>
          <span className={segmentClassName(seconds)}>{pad(seconds)}</span>
        </span>
        {!disabled && (
          <span className={styles.actions}>
            {showPlay && (
              <button
                type="button"
                className={styles.actionButton}
                title={t("components.taskWorkTimer.playLabel", { taskTitle })}
                aria-label={t("components.taskWorkTimer.playLabel", { taskTitle })}
                onClick={() => onAction("start")}
              >
                <Play size={14} aria-hidden="true" />
              </button>
            )}
            {showPause && (
              <button
                type="button"
                className={styles.actionButton}
                title={t("components.taskWorkTimer.pauseLabel", { taskTitle })}
                aria-label={t("components.taskWorkTimer.pauseLabel", { taskTitle })}
                onClick={() => onAction("pause")}
              >
                <Pause size={14} aria-hidden="true" />
              </button>
            )}
            {showStop && (
              <button
                type="button"
                className={styles.actionButton}
                title={t("components.taskWorkTimer.stopLabel", { taskTitle })}
                aria-label={t("components.taskWorkTimer.stopLabel", { taskTitle })}
                onClick={() => onAction("stop")}
              >
                <Square size={14} aria-hidden="true" />
              </button>
            )}
            {showReset && (
              <button
                type="button"
                className={styles.actionButtonDanger}
                title={t("components.taskWorkTimer.resetLabel", { taskTitle })}
                aria-label={t("components.taskWorkTimer.resetLabel", { taskTitle })}
                onClick={() => onAction("reset")}
              >
                <X size={14} aria-hidden="true" />
              </button>
            )}
            <button
              ref={editButtonRef}
              type="button"
              className={styles.actionButton}
              title={t("components.taskWorkTimer.editLabel", { taskTitle })}
              aria-label={t("components.taskWorkTimer.editLabel", { taskTitle })}
              aria-haspopup="dialog"
              aria-expanded={isEditOpen}
              aria-controls={editPanelId}
              onClick={handleOpenEdit}
            >
              <Pencil size={14} aria-hidden="true" />
            </button>
          </span>
        )}
      </div>
      {isEditOpen &&
        createPortal(
          <div
            ref={editPanelRef}
            id={editPanelId}
            role="dialog"
            aria-label={t("components.taskWorkTimer.editLabel", { taskTitle })}
            className={styles.editPanel}
          >
            <form
              className={styles.editForm}
              onSubmit={(event) => {
                event.preventDefault();
                handleSaveEdit();
              }}
            >
              {/* Stesso formato "gg hh:mm:ss" del badge sopra (righe 233-240):
                  i due punti tra ore/minuti/secondi sono testo statico
                  aria-hidden (non cifre, niente da annunciare), il campo
                  giorni si stacca con un margin invece che con un ":" per lo
                  stesso motivo di .daySegment nel badge — "00 00" non deve
                  sembrare due cifre di una stessa unità. */}
              <div className={styles.editFields}>
                {SEGMENT_FIELDS.map((field, index) => (
                  <Fragment key={field.key}>
                    {(index === 2 || index === 3) && (
                      <span className={styles.editSeparator} aria-hidden="true">
                        :
                      </span>
                    )}
                    <div
                      className={
                        index === 0
                          ? `${styles.editField} ${styles.editFieldDay}`
                          : styles.editField
                      }
                    >
                      <input
                        ref={index === 0 ? firstFieldRef : undefined}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={2}
                        value={pad(draft[field.key])}
                        aria-label={t(field.labelKey)}
                        className={styles.editInput}
                        onFocus={(event) => event.target.select()}
                        onChange={(event) => handleDraftChange(field.key, event.target.value)}
                        onBlur={() => handleDraftBlur(field.key)}
                      />
                      <span className={styles.editFieldLabel} aria-hidden="true">
                        {t(field.shortLabelKey)}
                      </span>
                    </div>
                  </Fragment>
                ))}
              </div>
              <div className={styles.editActions}>
                <button
                  type="button"
                  className={styles.editCancelButton}
                  onClick={handleCancelEdit}
                >
                  {t("components.taskWorkTimer.cancelLabel")}
                </button>
                <button type="submit" className={styles.editSaveButton}>
                  {t("components.taskWorkTimer.saveLabel")}
                </button>
              </div>
            </form>
          </div>,
          document.body,
        )}
      {/* Didascalia fissa che mappa esplicitamente ogni segmento (formato
          "gg hh:mm:ss"): non una frase descrittiva, ma un piccolo "legend"
          allineato visivamente ai 4 segmenti sopra, così spiega il formato
          senza bisogno di tradurre una frase intera né di occupare più di una
          riga strettissima. Sempre presente (anche a 00 00:00:00): il dubbio
          "cosa sono questi numeri" esiste soprattutto la prima volta che si
          vede il badge, quando è ancora a zero. */}
      <span className={styles.legend}>{t("components.taskWorkTimer.timeLegend")}</span>
    </div>
  );
}

export default TaskWorkTimerComponent;
