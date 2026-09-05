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

  usePageMeta({
    title: isLogin
      ? t("pages.auth.meta.title.login")
      : isImport
        ? t("pages.auth.meta.title.import")
        : t("pages.auth.meta.title.register"),
    description: isLogin
      ? t("pages.auth.meta.description.login")
      : isImport
        ? t("pages.auth.meta.description.import")
        : t("pages.auth.meta.description.register"),
  });

  return (
    <div className={styles.authContainer}>
      <div className={styles.authLanguageSwitcher}>
        <LanguageSwitcherComponent />
      </div>
      <div className={styles.authHero}>
        <span className={styles.authEyebrow}>{t("pages.auth.eyebrow")}</span>
        <h1 className={styles.authTitle}>
          {isLogin
            ? t("pages.auth.title.login")
            : isImport
              ? t("pages.auth.title.import")
              : t("pages.auth.title.register")}
        </h1>
        <p className={styles.authSubtitle}>
          {isLogin
            ? t("pages.auth.subtitle.login")
            : isImport
              ? t("pages.auth.subtitle.import")
              : t("pages.auth.subtitle.register")}
        </p>
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
        {isImport
          ? t("pages.auth.toggle.backToRegister")
          : isLogin
            ? t("pages.auth.toggle.toRegister")
            : t("pages.auth.toggle.toLogin")}
      </button>
    </div>
  );
}

export default Auth;
