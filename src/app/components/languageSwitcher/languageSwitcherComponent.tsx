import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "../../../shared/i18n/i18n";
import itFlag from "../../../assets/flags/it.svg";
import gbFlag from "../../../assets/flags/gb.svg";
import styles from "./languageSwitcherComponent.module.css";

// bandiera rotonda per lingua (circle-flags, HatScripts): l'inglese usa la
// bandiera del Regno Unito, non quella USA.
const LANGUAGE_FLAGS: Record<SupportedLanguage, string> = {
  it: itFlag,
  en: gbFlag,
};

// select nativo (non un menu custom come quello progetti/account della
// topbar): due sole opzioni, il costo di gestione focus/tastiera/portal di un
// menu custom non è giustificato qui, e il select nativo resta accessibile
// gratis su ogni browser/screen reader. La bandiera è solo un'icona
// decorativa sovrapposta al trigger: le <option> restano testo puro, perché
// i browser non renderizzano immagini al loro interno.
function LanguageSwitcherComponent() {
  const { t, i18n } = useTranslation();
  const currentLanguage = i18n.resolvedLanguage as SupportedLanguage;

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    void i18n.changeLanguage(event.target.value);
  }

  return (
    <div className={styles.languageSwitcherWrapper}>
      <img
        className={styles.languageFlag}
        src={LANGUAGE_FLAGS[currentLanguage]}
        alt=""
        aria-hidden="true"
      />
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
    </div>
  );
}

export default LanguageSwitcherComponent;
