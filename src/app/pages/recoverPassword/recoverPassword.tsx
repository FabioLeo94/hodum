import styles from "./recoverPassword.module.css";
import RecoverPasswordFormComponent from "../../components/recoverPasswordForm/recoverPasswordFormComponent";
import { useEffect } from "react";
import { isAuthenticated } from "../../services/auth/authService";
import { useNavigate, Link } from "react-router";
import { usePageMeta } from "../../../shared/hooks/usePageMeta";

function RecoverPassword() {
  const navigate = useNavigate();
  useEffect(() => {
    if (isAuthenticated()) {
      navigate("/dashboard");
    }
    // navigate è stabile per la durata del mount su questa rotta, stesso
    // motivo di auth.tsx.
  }, [navigate]);

  usePageMeta({
    title: "Recupera l'accesso",
    robots: "noindex, nofollow",
  });

  return (
    <div className={styles.recoverPasswordContainer}>
      <div className={styles.recoverPasswordHero}>
        <span className={styles.recoverPasswordEyebrow}>Hodum</span>
        <h1 className={styles.recoverPasswordTitle}>Recupera l'accesso</h1>
        <p className={styles.recoverPasswordSubtitle}>
          Inserisci l'email dell'account e il codice di recupero ricevuto
          alla registrazione per impostare una nuova password.
        </p>
      </div>
      <div className={styles.recoverPasswordFormWrapper}>
        <RecoverPasswordFormComponent />
      </div>
      <Link to="/auth" className={styles.recoverPasswordBack}>
        Torna al login
      </Link>
    </div>
  );
}

export default RecoverPassword;
