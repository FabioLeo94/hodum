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

// Il submit di successo fa una sola chiamata: POST /companies crea azienda +
// owner e restituisce già il token di sessione (vedi companyService.ts),
// niente più POST /auth/login separata.
function mockRegisterCompanySuccess(): void {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(201, {
      user: { id: "1", username: "mario", email: "mario@example.com", companyId: "10", role: "owner" },
      company: { id: "10", name: "Acme", ownerId: "1" },
      token: "signed-jwt-token",
    }),
  );
}

function renderForm() {
  return render(
    <MemoryRouter>
      <RegisterFormComponent />
    </MemoryRouter>,
  );
}

async function fillValidForm(): Promise<void> {
  fireEvent.change(screen.getByPlaceholderText("Nome azienda"), {
    target: { value: "Acme" },
  });
  fireEvent.change(screen.getByPlaceholderText("Nome"), {
    target: { value: "Mario" },
  });
  fireEvent.change(screen.getByPlaceholderText("Cognome"), {
    target: { value: "Rossi" },
  });
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
}

describe("RegisterFormComponent", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the fields: company name, first/last name, username, email, password, confirm password", () => {
    renderForm();
    expect(screen.getByPlaceholderText("Nome azienda")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Nome")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Cognome")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Username")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Email")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Password")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Conferma password")).toBeInTheDocument();
  });

  it("shows inline validation errors when submitting an empty form", async () => {
    renderForm();
    fireEvent.click(screen.getByText("Registrati"));

    expect(
      await screen.findByText("Inserire il nome dell'azienda."),
    ).toBeInTheDocument();
    expect(screen.getByText("Inserire il nome.")).toBeInTheDocument();
    expect(screen.getByText("Inserire il cognome.")).toBeInTheDocument();
    expect(screen.getByText("Inserire una email valida.")).toBeInTheDocument();
    expect(
      screen.getByText(
        "La password deve contenere almeno 8 caratteri, una minuscola, una maiuscola e un numero.",
      ),
    ).toBeInTheDocument();
  });

  it("submits successfully with an empty username, falling back to first/last name server-side", async () => {
    mockRegisterCompanySuccess();
    renderForm();

    fireEvent.change(screen.getByPlaceholderText("Nome azienda"), {
      target: { value: "Acme" },
    });
    fireEvent.change(screen.getByPlaceholderText("Nome"), {
      target: { value: "Mario" },
    });
    fireEvent.change(screen.getByPlaceholderText("Cognome"), {
      target: { value: "Rossi" },
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
    const [, options] = vi.mocked(fetch).mock.calls[0];
    expect(JSON.parse(options?.body as string)).not.toHaveProperty("username");
  });

  it("shows a mismatch error when password and confirm password differ", async () => {
    renderForm();
    fireEvent.change(screen.getByPlaceholderText("Nome azienda"), {
      target: { value: "Acme" },
    });
    fireEvent.change(screen.getByPlaceholderText("Nome"), {
      target: { value: "Mario" },
    });
    fireEvent.change(screen.getByPlaceholderText("Cognome"), {
      target: { value: "Rossi" },
    });
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

    await fillValidForm();
    fireEvent.click(screen.getByText("Registrati"));

    const submitButton = await screen.findByRole("button", {
      name: "Registrazione in corso...",
    });
    expect(submitButton).toBeDisabled();

    resolveFetch(
      jsonResponse(201, {
        user: { id: "1", username: "mario", email: "mario@example.com", companyId: "10", role: "owner" },
        company: { id: "10", name: "Acme", ownerId: "1" },
        token: "signed-jwt-token",
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Registrati" }),
      ).not.toBeDisabled(),
    );
  });

  it("calls registerCompany, persists the session and navigates on success", async () => {
    mockRegisterCompanySuccess();
    renderForm();

    await fillValidForm();
    fireEvent.click(screen.getByText("Registrati"));

    await vi.waitFor(() =>
      expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBe("signed-jwt-token"),
    );
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/companies",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("shows a conflict error message on a 409 response without persisting the session", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(409, { message: "Username o email già in uso." }),
    );
    renderForm();

    await fillValidForm();
    fireEvent.click(screen.getByText("Registrati"));

    expect(
      await screen.findByText("Username o email già in uso."),
    ).toBeInTheDocument();
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
  });
});
