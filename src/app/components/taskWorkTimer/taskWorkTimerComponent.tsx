import { useEffect, useState } from "react";
import { Pause, Play, Square, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TaskStatus, WorkTimerAction } from "../../../shared/types/project";
import { formatElapsedDuration } from "../../../shared/utils/formatElapsedDuration";
import styles from "./taskWorkTimerComponent.module.css";

interface Prop {
  status: TaskStatus;
  taskTitle: string;
  workStartedAt: string | null;
  workAccumulatedSeconds: number;
  workEndedAt: string | null;
  onAction: (action: WorkTimerAction) => void;
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

  const showPlay = isActiveStatus && !isRunning;
  const showPause = isActiveStatus && isRunning;
  const showStop = isActiveStatus && (isRunning || (hasProgress && workEndedAt === null));
  const showReset = isActiveStatus && hasProgress;

  return (
    <div className={styles.timer}>
      <span className={styles.time} aria-live={isRunning ? "polite" : undefined}>
        {formatElapsedDuration(displaySeconds)}
      </span>
      {isActiveStatus && (
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
  );
}

export default TaskWorkTimerComponent;
