import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import RegisterFormComponent from "./registerFormComponent";
import { AUTH_STORAGE_KEY } from "../../services/auth/authService";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

function renderForm() {
  return render(
    <MemoryRouter>
      <RegisterFormComponent />
    </MemoryRouter>,
  );
}

describe("RegisterFormComponent", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the four fields: username, email, password, confirm password", () => {
    renderForm();
    expect(screen.getByPlaceholderText("Username")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Email")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Password")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Conferma password")).toBeInTheDocument();
  });

  it("shows inline validation errors when submitting an empty form", async () => {
    renderForm();
    fireEvent.click(screen.getByText("Registrati"));

    expect(
      await screen.findByText("Inserire uno username."),
    ).toBeInTheDocument();
    expect(screen.getByText("Inserire una email valida.")).toBeInTheDocument();
    expect(
      screen.getByText(
        "La password deve contenere almeno 8 caratteri, una minuscola, una maiuscola e un numero.",
      ),
    ).toBeInTheDocument();
  });

  it("shows a mismatch error when password and confirm password differ", async () => {
    renderForm();
    fireEvent.change(screen.getByPlaceholderText("Username"), {
      target: { value: "mario" },
    });
    fireEvent.change(screen.getByPlaceholderText("Email"), {
      target: { value: "mario@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "Password1" },
    });
    fireEvent.change(screen.getByPlaceholderText("Conferma password"), {
      target: { value: "Different1" },
    });
    fireEvent.click(screen.getByText("Registrati"));

    expect(
      await screen.findByText("Le password non coincidono."),
    ).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("calls createUser, persists the session and navigates on success", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(201, { id: "1", username: "mario", email: "mario@example.com" }),
    );
    renderForm();

    fireEvent.change(screen.getByPlaceholderText("Username"), {
      target: { value: "mario" },
    });
    fireEvent.change(screen.getByPlaceholderText("Email"), {
      target: { value: "mario@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "Password1" },
    });
    fireEvent.change(screen.getByPlaceholderText("Conferma password"), {
      target: { value: "Password1" },
    });
    fireEvent.click(screen.getByText("Registrati"));

    await vi.waitFor(() =>
      expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBe("true"),
    );
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/users",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("shows a conflict error message on a 409 response without persisting the session", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(409, { message: "Username o email già in uso." }),
    );
    renderForm();

    fireEvent.change(screen.getByPlaceholderText("Username"), {
      target: { value: "mario" },
    });
    fireEvent.change(screen.getByPlaceholderText("Email"), {
      target: { value: "mario@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "Password1" },
    });
    fireEvent.change(screen.getByPlaceholderText("Conferma password"), {
      target: { value: "Password1" },
    });
    fireEvent.click(screen.getByText("Registrati"));

    expect(
      await screen.findByText("Username o email già in uso."),
    ).toBeInTheDocument();
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });
});
