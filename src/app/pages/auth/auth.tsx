import styles from "./auth.module.css";
import AuthFormComponent from "../../components/authForm/authFormComponent";
import { useEffect } from "react";
import { AUTH_STORAGE_KEY } from "../../services/auth/authService";
import { useNavigate } from "react-router";

function Auth() {
  let navigate = useNavigate();
  useEffect(() => {
    if (localStorage.getItem(AUTH_STORAGE_KEY) === "true") {
      navigate("/dashboard");
    }
  }, []);

  return (
    <div className={styles.authContainer}>
      <div className={styles.authHero}>
        <span className={styles.authEyebrow}>Task Manager</span>
        <h1 className={styles.authTitle}>Bentornato</h1>
        <p className={styles.authSubtitle}>
          Accedi per continuare a gestire i tuoi progetti e le tue attività.
        </p>
      </div>
      <AuthFormComponent />
    </div>
  );
}

export default Auth;
