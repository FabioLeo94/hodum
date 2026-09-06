import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "../../../shared/i18n/i18n";
import styles from "./languageSwitcherComponent.module.css";

// select nativo (non un menu custom come quello progetti/account della
// topbar): due sole opzioni, il costo di gestione focus/tastiera/portal di un
// menu custom non è giustificato qui, e il select nativo resta accessibile
// gratis su ogni browser/screen reader. Niente bandiera sovrapposta al
// trigger: i browser non renderizzano immagini dentro le <option>, quindi
// riservare uno spazio icona lascerebbe un vuoto ingiustificato nella lista
// aperta.
function LanguageSwitcherComponent() {
  const { t, i18n } = useTranslation();
  const currentLanguage = i18n.resolvedLanguage as SupportedLanguage;

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    void i18n.changeLanguage(event.target.value);
  }

  return (
    <select
      className={styles.languageSwitcher}
      aria-label={t("components.languageSwitcher.label")}
      value={currentLanguage}
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
