import { useEffect, useState } from "react";
import { Pause, Play, Square, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TaskStatus, WorkTimerAction } from "../../../shared/types/project";
import { decomposeElapsedDuration } from "../../../shared/utils/decomposeElapsedDuration";
import styles from "./taskWorkTimerComponent.module.css";

// Ogni segmento a due cifre: sempre presente (anche a "00"), l'attenuazione
// visiva dei segmenti a zero è affidata a .segmentMuted (vedi CSS), non alla
// loro assenza. Nessun padding testuale dal valore grezzo qui: lo fa questa
// funzione, decomposeElapsedDuration resta pura e senza formattazione.
const pad = (value: number) => String(value).padStart(2, "0");

interface Prop {
  status: TaskStatus;
  taskTitle: string;
  workStartedAt: string | null;
  workAccumulatedSeconds: number;
  workEndedAt: string | null;
  onAction: (action: WorkTimerAction) => void;
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
        {!disabled && isActiveStatus && (
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
          </span>
        )}
      </div>
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
