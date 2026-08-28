import styles from "./auth.module.css";
import AuthFormComponent from "../../components/authForm/authFormComponent";
import RegisterFormComponent from "../../components/registerForm/registerFormComponent";
import { useEffect, useState } from "react";
import { isAuthenticated } from "../../services/auth/authService";
import { useNavigate } from "react-router";

type AuthMode = "login" | "register";

function Auth() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<AuthMode>("login");
  useEffect(() => {
    if (isAuthenticated()) {
      navigate("/dashboard");
    }
  }, []);

  const isLogin = mode === "login";

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
      {isLogin ? <AuthFormComponent /> : <RegisterFormComponent />}
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
