import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import ChangePasswordFormComponent from "./changePasswordFormComponent";
import {
  AUTH_TOKEN_KEY,
  AUTH_USER_KEY,
  type User,
} from "../../services/auth/authService";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

const sampleUser: User = {
  id: "1",
  username: "mario",
  email: "mario@example.com",
  companyId: "10",
  role: "employee",
  mustChangePassword: true,
};

function seedSession(): void {
  sessionStorage.setItem(AUTH_TOKEN_KEY, "signed-jwt-token");
  sessionStorage.setItem(AUTH_USER_KEY, JSON.stringify(sampleUser));
}

function renderForm() {
  return render(
    <MemoryRouter>
      <ChangePasswordFormComponent />
    </MemoryRouter>,
  );
}

function fillValidForm(): void {
  fireEvent.change(screen.getByPlaceholderText("Nuova password"), {
    target: { value: "Password1" },
  });
  fireEvent.change(screen.getByPlaceholderText("Conferma nuova password"), {
    target: { value: "Password1" },
  });
}

describe("ChangePasswordFormComponent", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the two fields: new password and confirm new password", () => {
    seedSession();
    renderForm();
    expect(screen.getByPlaceholderText("Nuova password")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Conferma nuova password"),
    ).toBeInTheDocument();
  });

  it("shows an inline validation error when submitting an empty form", async () => {
    seedSession();
    renderForm();
    fireEvent.click(screen.getByText("Aggiorna password"));

    expect(
      await screen.findByText(
        "La password deve contenere almeno 8 caratteri, una minuscola, una maiuscola e un numero.",
      ),
    ).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows a mismatch error when password and confirm password differ", async () => {
    seedSession();
    renderForm();
    fireEvent.change(screen.getByPlaceholderText("Nuova password"), {
      target: { value: "Password1" },
    });
    fireEvent.change(screen.getByPlaceholderText("Conferma nuova password"), {
      target: { value: "Different1" },
    });
    fireEvent.click(screen.getByText("Aggiorna password"));

    expect(
      await screen.findByText("Le password non coincidono."),
    ).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("disables the submit button and shows a loading label while the request is in flight", async () => {
    seedSession();
    let resolveFetch: (response: Response) => void = () => {};
    vi.mocked(fetch).mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );
    renderForm();

    fillValidForm();
    fireEvent.click(screen.getByText("Aggiorna password"));

    const submitButton = await screen.findByRole("button", {
      name: "Aggiornamento in corso...",
    });
    expect(submitButton).toBeDisabled();

    resolveFetch(
      jsonResponse(200, { ...sampleUser, mustChangePassword: false }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Aggiorna password" }),
      ).not.toBeDisabled(),
    );
  });

  it("persists the updated user and navigates to the dashboard on success", async () => {
    seedSession();
    const updatedUser: User = { ...sampleUser, mustChangePassword: false };
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, updatedUser));
    renderForm();

    fillValidForm();
    fireEvent.click(screen.getByText("Aggiorna password"));

    await waitFor(() =>
      expect(sessionStorage.getItem(AUTH_USER_KEY)).toBe(
        JSON.stringify(updatedUser),
      ),
    );
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/users/1/password",
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("shows a backend error message on a 422 response without navigating away", async () => {
    seedSession();
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(422, { message: "Password non valida." }),
    );
    renderForm();

    fillValidForm();
    fireEvent.click(screen.getByText("Aggiorna password"));

    expect(
      await screen.findByText("Password non valida."),
    ).toBeInTheDocument();
  });

  it("shows a session error and does not call the API when no user is stored", async () => {
    renderForm();

    fillValidForm();
    fireEvent.click(screen.getByText("Aggiorna password"));

    expect(
      await screen.findByText(
        "Sessione non valida. Effettua nuovamente l'accesso.",
      ),
    ).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
});
