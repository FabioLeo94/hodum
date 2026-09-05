import styles from "./recoverPassword.module.css";
import RecoverPasswordFormComponent from "../../components/recoverPasswordForm/recoverPasswordFormComponent";
import { useEffect } from "react";
import { isAuthenticated } from "../../services/auth/authService";
import { useNavigate, Link } from "react-router";
import { useTranslation } from "react-i18next";
import { usePageMeta } from "../../../shared/hooks/usePageMeta";

function RecoverPassword() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  useEffect(() => {
    if (isAuthenticated()) {
      navigate("/dashboard");
    }
    // navigate è stabile per la durata del mount su questa rotta, stesso
    // motivo di auth.tsx.
  }, [navigate]);

  usePageMeta({
    title: t("pages.recoverPassword.meta.title"),
    robots: "noindex, nofollow",
  });

  return (
    <div className={styles.recoverPasswordContainer}>
      <div className={styles.recoverPasswordHero}>
        <span className={styles.recoverPasswordEyebrow}>
          {t("pages.recoverPassword.eyebrow")}
        </span>
        <h1 className={styles.recoverPasswordTitle}>{t("pages.recoverPassword.title")}</h1>
        <p className={styles.recoverPasswordSubtitle}>
          {t("pages.recoverPassword.subtitle")}
        </p>
      </div>
      <div className={styles.recoverPasswordFormWrapper}>
        <RecoverPasswordFormComponent />
      </div>
      <Link to="/auth" className={styles.recoverPasswordBack}>
        {t("pages.recoverPassword.backToLogin")}
      </Link>
    </div>
  );
}

export default RecoverPassword;
