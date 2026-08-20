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

  it("shows an error and does not persist the session for an invalid email", async () => {
    render(<AuthFormComponent />);
    fireEvent.change(screen.getByPlaceholderText("Email"), {
      target: { value: "not-an-email" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "demo1234" },
    });
    fireEvent.click(screen.getByText("Accedi"));

    expect(
      await screen.findByText("Inserisci un indirizzo email valido."),
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
