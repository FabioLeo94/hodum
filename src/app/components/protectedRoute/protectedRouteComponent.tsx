import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { isAuthenticated } from "../../services/auth/authService";

interface Prop {
  children: ReactNode;
}

function ProtectedRouteComponent({ children }: Prop) {
  if (!isAuthenticated()) {
    return <Navigate to="/auth" replace />;
  }

  return children;
}

export default ProtectedRouteComponent;
