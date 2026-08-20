import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AuthFormComponent from "./authFormComponent";
import { AUTH_STORAGE_KEY } from "../../services/auth/authService";

describe("AuthFormComponent", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders email above password, with the remember-me checkbox below", () => {
    render(<AuthFormComponent />);
    expect(screen.getByPlaceholderText("Email")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Password")).toBeInTheDocument();
    expect(screen.getByText("Resta connesso")).toBeInTheDocument();
  });

  it("shows a red border and an error message under the email field for an invalid email", () => {
    render(<AuthFormComponent />);
    const emailInput = screen.getByPlaceholderText("Email");

    fireEvent.change(emailInput, { target: { value: "not-an-email" } });

    expect(screen.getByText("Inserire una email valida.")).toBeInTheDocument();
    expect(emailInput.className).toContain("inputBaseError");
  });

  it("shows an email error when submitting with an empty email field", async () => {
    render(<AuthFormComponent />);

    fireEvent.click(screen.getByText("Accedi"));

    expect(
      await screen.findByText("Inserire una email valida."),
    ).toBeInTheDocument();
  });

  it("does not persist the session and shows a password error for a mismatched login", async () => {
    render(<AuthFormComponent />);
    fireEvent.change(screen.getByPlaceholderText("Email"), {
      target: { value: "demo@taskmanager.dev" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "wrong-password" },
    });
    fireEvent.click(screen.getByText("Accedi"));

    expect(
      await screen.findByText("Email o password non corretti."),
    ).toBeInTheDocument();
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });

  it("persists the session on successful login when remember-me is checked", async () => {
    render(<AuthFormComponent />);
    fireEvent.change(screen.getByPlaceholderText("Email"), {
      target: { value: "demo@taskmanager.dev" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "demo1234" },
    });
    fireEvent.click(screen.getByText("Resta connesso"));
    fireEvent.click(screen.getByText("Accedi"));

    await waitFor(() =>
      expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBe("true"),
    );
  });
});
