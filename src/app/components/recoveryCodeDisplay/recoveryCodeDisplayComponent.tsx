import { useState } from "react";
import { useTranslation } from "react-i18next";
import styles from "./recoveryCodeDisplayComponent.module.css";
import ButtonComponent from "../button/buttonComponent";

interface Prop {
  recoveryCode: string;
  onConfirm: () => void;
  confirmLabel?: string;
}

// Mostrato una sola volta dopo la registrazione (registerFormComponent) e
// dopo un recupero riuscito (recoverPasswordFormComponent): il backend non
// conserva mai il codice in chiaro, solo il suo hash bcrypt (vedi
// backend/src/services/companyService.ts e authService.ts), quindi questo è
// l'unica occasione in cui l'utente può vederlo. Il pulsante di conferma
// resta disabilitato finché non viene spuntata la checkbox, per non lasciare
// che si prosegua per disattenzione senza averlo salvato.
function RecoveryCodeDisplayComponent({ recoveryCode, onConfirm, confirmLabel }: Prop) {
  const { t } = useTranslation();
  const resolvedConfirmLabel = confirmLabel ?? t("components.recoveryCodeDisplay.defaultConfirmLabel");
  const [copied, setCopied] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(recoveryCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API non disponibile o permesso negato (es. contesto non
      // sicuro): il codice resta comunque leggibile/selezionabile a mano nel
      // box sottostante, nessun fallback necessario oltre a non far
      // esplodere l'handler.
    }
  }

  return (
    <div className={styles.recoveryCodeCard} role="alert">
      <h2 className={styles.recoveryCodeTitle}>
        {t("components.recoveryCodeDisplay.title")}
      </h2>
      <p className={styles.recoveryCodeDescription}>
        {t("components.recoveryCodeDisplay.description")}
      </p>
      <div className={styles.recoveryCodeBox}>
        <code className={styles.recoveryCodeValue}>{recoveryCode}</code>
        <button
          type="button"
          className={styles.recoveryCodeCopyButton}
          onClick={handleCopy}
        >
          {copied
            ? t("components.recoveryCodeDisplay.copied")
            : t("components.recoveryCodeDisplay.copy")}
        </button>
      </div>
      <label className={styles.recoveryCodeAck}>
        <input
          className={styles.recoveryCodeCheckbox}
          type="checkbox"
          checked={acknowledged}
          onChange={(event) => setAcknowledged(event.target.checked)}
        />
        {t("components.recoveryCodeDisplay.acknowledge")}
      </label>
      <ButtonComponent onClick={onConfirm} disabled={!acknowledged}>
        {resolvedConfirmLabel}
      </ButtonComponent>
    </div>
  );
}

export default RecoveryCodeDisplayComponent;
