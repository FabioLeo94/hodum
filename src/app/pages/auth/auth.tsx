import styles from "./auth.module.css";
import AuthFormComponent from "../../components/authForm/authFormComponent";
import RegisterFormComponent from "../../components/registerForm/registerFormComponent";
import ImportCompanyFormComponent from "../../components/importCompanyForm/importCompanyFormComponent";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { isAuthenticated } from "../../services/auth/authService";
import { useNavigate } from "react-router";
import { usePageMeta } from "../../../shared/hooks/usePageMeta";
import LanguageSwitcherComponent from "../../components/languageSwitcher/languageSwitcherComponent";

type AuthMode = "login" | "register" | "import";

function Auth() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [mode, setMode] = useState<AuthMode>("login");
  useEffect(() => {
    if (isAuthenticated()) {
      navigate("/dashboard");
    }
    // navigate è stabile per la durata del mount su questa rotta (cambia
    // identità solo se cambia il pathname corrente, cosa che qui smonterebbe
    // comunque il componente): includerla soddisfa exhaustive-deps senza
    // introdurre riesecuzioni spurie.
  }, [navigate]);

  const isLogin = mode === "login";
  const isImport = mode === "import";

  // Stesso pattern di MODE_COPY in taskFormModalComponent: un record indicizzato
  // dal discriminante invece di ternari annidati ripetuti per ogni testo che
  // varia con `mode` (meta title/description, titolo, sottotitolo, toggle).
  const AUTH_COPY: Record<
    AuthMode,
    { metaTitle: string; metaDescription: string; title: string; subtitle: string; toggleLabel: string }
  > = {
    login: {
      metaTitle: t("pages.auth.meta.title.login"),
      metaDescription: t("pages.auth.meta.description.login"),
      title: t("pages.auth.title.login"),
      subtitle: t("pages.auth.subtitle.login"),
      toggleLabel: t("pages.auth.toggle.toRegister"),
    },
    import: {
      metaTitle: t("pages.auth.meta.title.import"),
      metaDescription: t("pages.auth.meta.description.import"),
      title: t("pages.auth.title.import"),
      subtitle: t("pages.auth.subtitle.import"),
      toggleLabel: t("pages.auth.toggle.backToRegister"),
    },
    register: {
      metaTitle: t("pages.auth.meta.title.register"),
      metaDescription: t("pages.auth.meta.description.register"),
      title: t("pages.auth.title.register"),
      subtitle: t("pages.auth.subtitle.register"),
      toggleLabel: t("pages.auth.toggle.toLogin"),
    },
  };
  const copy = AUTH_COPY[mode];

  usePageMeta({ title: copy.metaTitle, description: copy.metaDescription });

  return (
    <div className={styles.authContainer}>
      <div className={styles.authLanguageSwitcher}>
        <LanguageSwitcherComponent />
      </div>
      <div className={styles.authHero}>
        <span className={styles.authEyebrow}>{t("pages.auth.eyebrow")}</span>
        <h1 className={styles.authTitle}>{copy.title}</h1>
        <p className={styles.authSubtitle}>{copy.subtitle}</p>
      </div>
      <div className={styles.authFormWrapper} key={mode}>
        {isLogin ? (
          <AuthFormComponent />
        ) : isImport ? (
          <ImportCompanyFormComponent />
        ) : (
          <RegisterFormComponent />
        )}
      </div>
      {/* Link secondario (non un terzo bottone alla pari col toggle
          login/registrati sotto): l'import resta un caso raro, riservato a
          chi arriva da un'altra installazione Hodum. */}
      {mode === "register" && (
        <button
          type="button"
          className={styles.authSecondaryLink}
          onClick={() => setMode("import")}
        >
          {t("pages.auth.toggle.toImport")}
        </button>
      )}
      <button
        type="button"
        className={styles.authToggle}
        onClick={() => setMode(isImport || isLogin ? "register" : "login")}
      >
        {copy.toggleLabel}
      </button>
    </div>
  );
}

export default Auth;
