import "./auth.css";
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
    <div className="authContainer">
      <AuthFormComponent />
    </div>
  );
}

export default Auth;
