import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy } from "lucide-react";
import AvatarComponent from "../avatar/avatarComponent";
import { formatDate, formatDateTime } from "../../../shared/utils/formatDate";
import styles from "./profileHeaderComponent.module.css";

interface Prop {
  displayName: string;
  email: string;
  createdAt: string;
  // Assente = non applicabile per questo chiamante (nessuna riga mostrata),
  // null = disponibile ma mai effettuato l'accesso ("Mai"): due significati
  // distinti, a differenza di createdAt che è sempre presente.
  lastLoginAt?: string | null;
}

// Condivisa da editAccountModalComponent ed editEmployeeModalComponent (task
// "Modifica account"/"Modifica dipendente"): stessa intestazione (avatar,
// nome, email, meta di sola lettura) sopra due form altrimenti diversi, per
// non duplicare la stessa struttura due volte.
function ProfileHeaderComponent({ displayName, email, createdAt, lastLoginAt }: Prop) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  async function handleCopyEmail() {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API non disponibile o permesso negato (es. contesto non
      // sicuro): l'email resta comunque leggibile e selezionabile a mano,
      // stesso comportamento di recoveryCodeDisplayComponent.
    }
  }

  return (
    <div className={styles.header}>
      <AvatarComponent displayName={displayName} size="lg" />
      <span className={styles.name}>{displayName}</span>
      <button
        type="button"
        className={styles.emailButton}
        onClick={handleCopyEmail}
        title={t("components.profileHeader.copyEmailHint")}
      >
        {email}
        {copied ? (
          <Check size={14} className={styles.emailButtonIcon} aria-hidden="true" />
        ) : (
          <Copy size={14} className={styles.emailButtonIcon} aria-hidden="true" />
        )}
      </button>
      <span className={styles.copyFeedback} role="status" aria-live="polite">
        {copied ? t("components.profileHeader.emailCopied") : ""}
      </span>
      <p className={styles.metaRow}>
        <span className={styles.metaLabel}>{t("components.profileHeader.createdAtLabel")}</span>
        <span className={styles.metaValue}>{formatDate(createdAt)}</span>
        {lastLoginAt !== undefined && (
          <>
            <span className={styles.metaSeparator} aria-hidden="true">
              •
            </span>
            <span className={styles.metaLabel}>{t("components.profileHeader.lastLoginLabel")}</span>
            <span className={styles.metaValue}>
              {lastLoginAt ? formatDateTime(lastLoginAt) : t("components.profileHeader.lastLoginNever")}
            </span>
          </>
        )}
      </p>
      <div className={styles.divider} role="separator" />
    </div>
  );
}

export default ProfileHeaderComponent;
