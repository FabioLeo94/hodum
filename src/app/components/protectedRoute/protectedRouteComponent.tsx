import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { getUser, isAuthenticated } from "../../services/auth/authService";

interface Prop {
  children: ReactNode;
}

function ProtectedRouteComponent({ children }: Prop) {
  if (!isAuthenticated()) {
    return <Navigate to="/auth" replace />;
  }

  const user = getUser();
  if (user?.mustChangePassword) {
    return <Navigate to="/change-password" replace />;
  }

  return children;
}

export default ProtectedRouteComponent;
