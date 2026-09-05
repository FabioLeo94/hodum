import { useState } from "react";
import { useTranslation } from "react-i18next";
import styles from "./importedCredentialsDisplayComponent.module.css";
import ButtonComponent from "../button/buttonComponent";
import type { TemporaryPasswordEntry } from "../../services/company/companyService";

interface Prop {
  temporaryPasswords: TemporaryPasswordEntry[];
  onConfirm: () => void;
}

// Mostrato una sola volta dopo un import riuscito (importCompanyFormComponent),
// subito dopo RecoveryCodeDisplayComponent: stesso principio, il backend non
// conserva mai queste password in chiaro (solo l'hash, vedi
// backend/src/services/companyService.ts), quindi questa è l'unica occasione
// in cui l'owner può vederle per consegnarle fuori banda a dipendenti/manager.
// Stesso pattern di conferma-con-checkbox di RecoveryCodeDisplayComponent, ma
// per una lista invece di un singolo codice.
function ImportedCredentialsDisplayComponent({ temporaryPasswords, onConfirm }: Prop) {
  const { t } = useTranslation();
  const [acknowledged, setAcknowledged] = useState(false);

  return (
    <div className={styles.importedCredentialsCard} role="alert">
      <h2 className={styles.importedCredentialsTitle}>
        {t("components.importedCredentialsDisplay.title")}
      </h2>
      <p className={styles.importedCredentialsDescription}>
        {t("components.importedCredentialsDisplay.description")}
      </p>
      {temporaryPasswords.length === 0 ? (
        <p className={styles.importedCredentialsEmpty}>
          {t("components.importedCredentialsDisplay.empty")}
        </p>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.importedCredentialsTable}>
            <thead>
              <tr>
                <th scope="col">{t("components.importedCredentialsDisplay.columnUsername")}</th>
                <th scope="col">{t("components.importedCredentialsDisplay.columnRole")}</th>
                <th scope="col">{t("components.importedCredentialsDisplay.columnPassword")}</th>
              </tr>
            </thead>
            <tbody>
              {temporaryPasswords.map((entry) => (
                <tr key={entry.username}>
                  <td>{entry.username}</td>
                  <td>
                    {entry.role === "manager"
                      ? t("components.importedCredentialsDisplay.roleManager")
                      : t("components.importedCredentialsDisplay.roleEmployee")}
                  </td>
                  <td>
                    <code className={styles.importedCredentialsPassword}>{entry.password}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <label className={styles.importedCredentialsAck}>
        <input
          className={styles.importedCredentialsCheckbox}
          type="checkbox"
          checked={acknowledged}
          onChange={(event) => setAcknowledged(event.target.checked)}
        />
        {t("components.importedCredentialsDisplay.acknowledge")}
      </label>
      <ButtonComponent onClick={onConfirm} disabled={!acknowledged}>
        {t("components.importedCredentialsDisplay.confirm")}
      </ButtonComponent>
    </div>
  );
}

export default ImportedCredentialsDisplayComponent;
