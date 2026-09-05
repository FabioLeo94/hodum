import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  dismissToast,
  subscribeToToasts,
  type NotifyToast,
  type NotifyType,
} from "../../services/notify/notifyService";
import styles from "./notifyComponent.module.css";

// Il toast resta leggibile a schermo per questo tempo prima di iniziare
// l'uscita. Il tempo di uscita deve combaciare con la transition di .toast in
// notifyComponent.module.css: se cambia una delle due durate, va cambiata
// anche l'altra, altrimenti il toast sparisce dall'array (quindi dal DOM)
// prima o dopo la fine dell'animazione.
const VISIBLE_MS = 5000;
const EXIT_MS = 220;

const ICON_BY_TYPE: Record<NotifyType, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
};

// role/aria-live per tipo: gli errori interrompono chi usa uno screen reader
// (role="alert" è di per sé una live region assertiva, non serve annidarlo in
// una propria), gli altri sono annunciati con garbo (role="status", polite).
const ROLE_BY_TYPE: Record<NotifyType, "alert" | "status"> = {
  success: "status",
  error: "alert",
  info: "status",
  warning: "status",
};

// Montato una sola volta in App.tsx, fuori dalle singole pagine: i toast
// devono restare visibili anche attraverso una navigazione (es. redirect dopo
// un salvataggio riuscito). Vedi notifyService.ts per come accodare un toast
// da qualunque punto del codice.
function NotifyComponent() {
  const [toasts, setToasts] = useState<NotifyToast[]>([]);

  useEffect(() => subscribeToToasts(setToasts), []);

  if (toasts.length === 0) return null;

  return createPortal(
    <div className={styles.container}>
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>,
    document.body,
  );
}

function ToastItem({ toast }: { toast: NotifyToast }) {
  const { t } = useTranslation();
  const [isLeaving, setIsLeaving] = useState(false);
  const Icon = ICON_BY_TYPE[toast.type];

  useEffect(() => {
    const visibleTimer = setTimeout(() => setIsLeaving(true), VISIBLE_MS);
    return () => clearTimeout(visibleTimer);
  }, []);

  // Effetto separato (non un unico setTimeout da VISIBLE_MS + EXIT_MS): la
  // rimozione deve scattare EXIT_MS dopo l'inizio dell'uscita, non EXIT_MS
  // dopo il mount, altrimenti il click su "chiudi" (che anticipa isLeaving)
  // rimuoverebbe il toast prima che l'animazione di uscita sia finita.
  useEffect(() => {
    if (!isLeaving) return;
    const removeTimer = setTimeout(() => dismissToast(toast.id), EXIT_MS);
    return () => clearTimeout(removeTimer);
  }, [isLeaving, toast.id]);

  return (
    <div
      role={ROLE_BY_TYPE[toast.type]}
      className={styles.toast}
      data-type={toast.type}
      data-leaving={isLeaving || undefined}
    >
      <Icon className={styles.icon} size={18} aria-hidden="true" />
      <span className={styles.message}>{toast.message}</span>
      <button
        type="button"
        className={styles.closeButton}
        aria-label={t("components.notify.closeLabel")}
        onClick={() => setIsLeaving(true)}
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

export default NotifyComponent;
