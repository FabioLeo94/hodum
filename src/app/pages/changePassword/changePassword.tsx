import styles from "./changePassword.module.css";
import ChangePasswordFormComponent from "../../components/changePasswordForm/changePasswordFormComponent";
import { useEffect } from "react";
import { getUser, isAuthenticated } from "../../services/auth/authService";
import { useNavigate } from "react-router";
import { usePageMeta } from "../../../shared/hooks/usePageMeta";

function ChangePassword() {
  const navigate = useNavigate();
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
    title: "Cambio password obbligatorio",
    robots: "noindex, nofollow",
  });

  return (
    <div className={styles.changePasswordContainer}>
      <div className={styles.changePasswordHero}>
        <span className={styles.changePasswordEyebrow}>Hodum</span>
        <h1 className={styles.changePasswordTitle}>Aggiorna la tua password</h1>
        <p className={styles.changePasswordSubtitle}>
          Per motivi di sicurezza devi impostare una nuova password prima di
          continuare.
        </p>
      </div>
      <div className={styles.changePasswordFormWrapper}>
        <ChangePasswordFormComponent />
      </div>
    </div>
  );
}

export default ChangePassword;
