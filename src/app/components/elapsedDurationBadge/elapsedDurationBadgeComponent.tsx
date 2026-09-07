import { useTranslation } from "react-i18next";
import { decomposeElapsedDuration } from "../../../shared/utils/decomposeElapsedDuration";
import styles from "./elapsedDurationBadgeComponent.module.css";

// Stesso padding a due cifre di taskWorkTimerComponent.tsx: nessuna
// formattazione qui, solo decomposeElapsedDuration + pad, per restare pura
// come quella funzione.
const pad = (value: number) => String(value).padStart(2, "0");

interface Prop {
  totalSeconds: number;
}

// Stesso stile a 4 segmenti sempre presenti del timer di lavorazione dei task
// (vedi taskWorkTimerComponent.tsx), riusato qui in sola lettura per le
// tabelle di fatturazione (colonna "Tempo lavorato" di invoices.tsx e
// generateInvoiceDrawerComponent.tsx): niente controlli play/pausa/stop, il
// valore è un totale già congelato. A differenza del task manca anche la
// didascalia fissa "gg hh:mm:ss" sotto il valore (occuperebbe una riga per
// ogni riga di tabella): la stessa spiegazione, unità per unità, vive invece
// nel tooltip nativo del browser (title), più esplicito perché nomina ogni
// unità invece di abbreviarla in due lettere.
function ElapsedDurationBadgeComponent({ totalSeconds }: Prop) {
  const { t } = useTranslation();
  const { days, hours, minutes, seconds } = decomposeElapsedDuration(totalSeconds);
  const segmentClassName = (value: number) =>
    value > 0 ? styles.segment : `${styles.segment} ${styles.segmentMuted}`;

  return (
    <span
      className={styles.time}
      title={t("components.elapsedDurationBadge.tooltip", { days, hours, minutes, seconds })}
    >
      <span className={`${segmentClassName(days)} ${styles.daySegment}`}>{pad(days)}</span>
      <span className={segmentClassName(hours)}>{pad(hours)}</span>
      <span aria-hidden="true">:</span>
      <span className={segmentClassName(minutes)}>{pad(minutes)}</span>
      <span aria-hidden="true">:</span>
      <span className={segmentClassName(seconds)}>{pad(seconds)}</span>
    </span>
  );
}

export default ElapsedDurationBadgeComponent;
