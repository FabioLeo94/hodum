import styles from "./changePassword.module.css";
import ChangePasswordFormComponent from "../../components/changePasswordForm/changePasswordFormComponent";
import { useEffect } from "react";
import { getUser, isAuthenticated } from "../../services/auth/authService";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { usePageMeta } from "../../../shared/hooks/usePageMeta";

function ChangePassword() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  useEffect(() => {
    if (!isAuthenticated()) {
      navigate("/auth", { replace: true });
      return;
    }
    const user = getUser();
    if (user && !user.mustChangePassword) {
      navigate("/dashboard", { replace: true });
    }
    // navigate è stabile per la durata del mount su questa rotta, stesso
    // motivo di auth.tsx.
  }, [navigate]);

  usePageMeta({
    title: t("pages.changePassword.meta.title"),
    robots: "noindex, nofollow",
  });

  return (
    <div className={styles.changePasswordContainer}>
      <div className={styles.changePasswordHero}>
        <span className={styles.changePasswordEyebrow}>{t("pages.changePassword.eyebrow")}</span>
        <h1 className={styles.changePasswordTitle}>{t("pages.changePassword.title")}</h1>
        <p className={styles.changePasswordSubtitle}>{t("pages.changePassword.subtitle")}</p>
      </div>
      <div className={styles.changePasswordFormWrapper}>
        <ChangePasswordFormComponent />
      </div>
    </div>
  );
}

export default ChangePassword;
