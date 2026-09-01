import styles from "./auth.module.css";
import AuthFormComponent from "../../components/authForm/authFormComponent";
import RegisterFormComponent from "../../components/registerForm/registerFormComponent";
import { useEffect, useState } from "react";
import { isAuthenticated } from "../../services/auth/authService";
import { useNavigate } from "react-router";
import { usePageMeta } from "../../../shared/hooks/usePageMeta";

type AuthMode = "login" | "register";

function Auth() {
  const navigate = useNavigate();
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

  usePageMeta({
    title: isLogin ? "Accedi" : "Registrati",
    description: isLogin
      ? "Accedi a Hodum per gestire i tuoi progetti e le tue attività."
      : "Crea un account Hodum per iniziare a gestire progetti e attività in modo semplice.",
  });

  return (
    <div className={styles.authContainer}>
      <div className={styles.authHero}>
        <span className={styles.authEyebrow}>Hodum</span>
        <h1 className={styles.authTitle}>
          {isLogin ? "Bentornato" : "Crea il tuo account"}
        </h1>
        <p className={styles.authSubtitle}>
          {isLogin
            ? "Accedi per continuare a gestire i tuoi progetti e le tue attività."
            : "Registrati per iniziare a gestire i tuoi progetti e le tue attività."}
        </p>
      </div>
      <div className={styles.authFormWrapper} key={mode}>
        {isLogin ? <AuthFormComponent /> : <RegisterFormComponent />}
      </div>
      <button
        type="button"
        className={styles.authToggle}
        onClick={() => setMode(isLogin ? "register" : "login")}
      >
        {isLogin ? "Non hai un account? Registrati" : "Hai già un account? Accedi"}
      </button>
    </div>
  );
}

export default Auth;
