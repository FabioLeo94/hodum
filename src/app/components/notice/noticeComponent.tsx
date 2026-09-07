import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Info, Megaphone, XCircle } from "lucide-react";
import styles from "./noticeComponent.module.css";

export type NoticeVariant = "error" | "warning" | "info" | "important";

interface Prop {
  variant: NoticeVariant;
  title?: string;
  text: string;
  // Icona sovrascrivibile dal chiamante (es. RotateCcw per un avviso specifico
  // sul reset di un countdown): lo stile resta comunque uno dei 4 predefiniti,
  // solo il glifo cambia.
  icon?: LucideIcon;
}

const ICON_BY_VARIANT: Record<NoticeVariant, LucideIcon> = {
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
  important: Megaphone,
};

// Solo "error" interrompe chi usa uno screen reader (role="alert" e' di per
// se' una live region assertiva): gli altri stili sono informativi e non
// devono tagliare la lettura in corso (role="status", polite), stesso
// criterio di ROLE_BY_TYPE in notifyComponent.tsx.
const ROLE_BY_VARIANT: Record<NoticeVariant, "alert" | "status"> = {
  error: "alert",
  warning: "status",
  info: "status",
  important: "status",
};

// Avviso persistente nel flusso della UI (a differenza di NotifyComponent,
// che mostra toast globali ed effimeri fuori portale): headless, icona/
// titolo/testo li sceglie il chiamante, lo stile visivo è sempre uno dei 4
// predefiniti qui sotto, mai css scritto ad hoc per un nuovo avviso.
function NoticeComponent({ variant, title, text, icon }: Prop) {
  const Icon = icon ?? ICON_BY_VARIANT[variant];

  return (
    <div className={styles.notice} data-variant={variant} role={ROLE_BY_VARIANT[variant]}>
      <Icon className={styles.icon} size={18} aria-hidden="true" />
      <div className={styles.content}>
        {title && <p className={styles.title}>{title}</p>}
        <p className={styles.text}>{text}</p>
      </div>
    </div>
  );
}

export default NoticeComponent;
