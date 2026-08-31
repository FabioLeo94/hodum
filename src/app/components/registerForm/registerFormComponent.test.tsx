import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import RegisterFormComponent from "./registerFormComponent";
import { AUTH_TOKEN_KEY } from "../../services/auth/authService";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

// Il submit di successo fa due chiamate in sequenza: POST /users (creazione)
// e POST /auth/login (per ottenere un token vero, vedi registerFormComponent.tsx).
function mockCreateThenLoginSuccess(): void {
  vi.mocked(fetch).mockImplementation((input) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.endsWith("/auth/login")) {
      return Promise.resolve(
        jsonResponse(200, {
          user: { id: "1", username: "mario", email: "mario@example.com" },
          token: "signed-jwt-token",
        }),
      );
    }
    return Promise.resolve(
      jsonResponse(201, { id: "1", username: "mario", email: "mario@example.com" }),
    );
  });
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

  it("disables the submit button and shows a loading label while the request is in flight", async () => {
    let resolveFetch: (response: Response) => void = () => {};
    vi.mocked(fetch).mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
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

    const submitButton = await screen.findByRole("button", {
      name: "Registrazione in corso...",
    });
    expect(submitButton).toBeDisabled();

    resolveFetch(
      jsonResponse(201, { id: "1", username: "mario", email: "mario@example.com" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Registrati" }),
      ).not.toBeDisabled(),
    );
  });

  it("calls createUser, persists the session and navigates on success", async () => {
    mockCreateThenLoginSuccess();
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
      expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBe("signed-jwt-token"),
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
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
  });
});
