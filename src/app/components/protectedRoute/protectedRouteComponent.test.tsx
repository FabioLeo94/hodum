import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import ProtectedRouteComponent from "./protectedRouteComponent";
import {
  AUTH_TOKEN_KEY,
  AUTH_USER_KEY,
  type User,
} from "../../services/auth/authService";

const baseUser: User = {
  id: "1",
  username: "mario",
  email: "mario@example.com",
  companyId: "10",
  role: "employee",
  mustChangePassword: false,
  createdAt: "2024-01-01T00:00:00.000Z",
  lastLoginAt: null,
};

function renderProtectedRoute() {
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <Routes>
        <Route path="/auth" element={<p>Pagina di accesso</p>} />
        <Route path="/change-password" element={<p>Cambio password</p>} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRouteComponent>
              <p>Contenuto protetto</p>
            </ProtectedRouteComponent>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProtectedRouteComponent", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("redirects to /auth when the user is not authenticated", () => {
    renderProtectedRoute();
    expect(screen.getByText("Pagina di accesso")).toBeInTheDocument();
  });

  it("redirects to /change-password when mustChangePassword is true", () => {
    sessionStorage.setItem(AUTH_TOKEN_KEY, "signed-jwt-token");
    sessionStorage.setItem(
      AUTH_USER_KEY,
      JSON.stringify({ ...baseUser, mustChangePassword: true }),
    );
    renderProtectedRoute();
    expect(screen.getByText("Cambio password")).toBeInTheDocument();
  });

  it("renders the children when authenticated and mustChangePassword is false", () => {
    sessionStorage.setItem(AUTH_TOKEN_KEY, "signed-jwt-token");
    sessionStorage.setItem(AUTH_USER_KEY, JSON.stringify(baseUser));
    renderProtectedRoute();
    expect(screen.getByText("Contenuto protetto")).toBeInTheDocument();
  });
});
