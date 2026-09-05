import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "../../../shared/i18n/i18n";
import styles from "./languageSwitcherComponent.module.css";

// select nativo (non un menu custom come quello progetti/account della
// topbar): due sole opzioni, il costo di gestione focus/tastiera/portal di un
// menu custom non è giustificato qui, e il select nativo resta accessibile
// gratis su ogni browser/screen reader.
function LanguageSwitcherComponent() {
  const { t, i18n } = useTranslation();

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    void i18n.changeLanguage(event.target.value);
  }

  return (
    <select
      className={styles.languageSwitcher}
      aria-label={t("components.languageSwitcher.label")}
      value={i18n.resolvedLanguage}
      onChange={handleChange}
    >
      {SUPPORTED_LANGUAGES.map((language: SupportedLanguage) => (
        <option key={language} value={language}>
          {t(`components.languageSwitcher.${language}`)}
        </option>
      ))}
    </select>
  );
}

export default LanguageSwitcherComponent;
