import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import AuthFormComponent from "./authFormComponent";
import { AUTH_TOKEN_KEY } from "../../services/auth/authService";

function renderAuthForm() {
  return render(
    <MemoryRouter>
      <AuthFormComponent />
    </MemoryRouter>,
  );
}

function jsonResponse(
  status: number,
  body: unknown = {},
  headers: Record<string, string> = {},
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    headers: new Headers(headers),
  } as Response;
}

describe("AuthFormComponent", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders email above password, with the remember-me checkbox below", () => {
    renderAuthForm();
    expect(screen.getByPlaceholderText("Email")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Password")).toBeInTheDocument();
    expect(screen.getByText("Resta connesso")).toBeInTheDocument();
  });

  it("shows a red border and an error message under the email field for an invalid email", () => {
    renderAuthForm();
    const emailInput = screen.getByPlaceholderText("Email");

    fireEvent.change(emailInput, { target: { value: "not-an-email" } });

    expect(screen.getByText("Inserire una email valida.")).toBeInTheDocument();
    expect(emailInput.className).toContain("inputBaseError");
  });

  it("shows an email error when submitting with an empty email field", async () => {
    renderAuthForm();

    fireEvent.click(screen.getByText("Accedi"));

    expect(
      await screen.findByText("Inserire una email valida."),
    ).toBeInTheDocument();
  });

  it("does not persist the session and shows a password error for a mismatched login", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(401, { message: "Email o password non corretti" }),
    );
    renderAuthForm();
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
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
  });

  it("disables the submit button and shows a loading label while the login request is in flight", async () => {
    let resolveFetch: (response: Response) => void = () => {};
    vi.mocked(fetch).mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );
    renderAuthForm();
    fireEvent.change(screen.getByPlaceholderText("Email"), {
      target: { value: "demo@taskmanager.dev" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "demo1234" },
    });
    fireEvent.click(screen.getByText("Accedi"));

    const submitButton = await screen.findByRole("button", {
      name: "Accesso in corso...",
    });
    expect(submitButton).toBeDisabled();

    resolveFetch(
      jsonResponse(200, {
        user: { id: "1", username: "demo", email: "demo@taskmanager.dev" },
        token: "signed-jwt-token",
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Accedi" })).not.toBeDisabled(),
    );
  });

  it("re-enables the submit button after a failed login so the user can retry", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(401, { message: "Email o password non corretti" }),
    );
    renderAuthForm();
    fireEvent.change(screen.getByPlaceholderText("Email"), {
      target: { value: "demo@taskmanager.dev" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "wrong-password" },
    });
    fireEvent.click(screen.getByText("Accedi"));

    await screen.findByText("Email o password non corretti.");
    expect(screen.getByRole("button", { name: "Accedi" })).not.toBeDisabled();
  });

  it("shows a countdown and disables the submit button on a 429 (rate limit)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(fetch).mockResolvedValue(jsonResponse(429, {}, { "RateLimit-Reset": "2" }));
    renderAuthForm();
    fireEvent.change(screen.getByPlaceholderText("Email"), {
      target: { value: "demo@taskmanager.dev" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "demo1234" },
    });
    fireEvent.click(screen.getByText("Accedi"));

    expect(
      await screen.findByText("Troppi tentativi di accesso. Riprova tra 0:02."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accedi" })).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(
      screen.queryByText(/Troppi tentativi di accesso/),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accedi" })).not.toBeDisabled();
    vi.useRealTimers();
  });

  it("persists the session on successful login when remember-me is checked", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(200, {
        user: { id: "1", username: "demo", email: "demo@taskmanager.dev" },
        token: "signed-jwt-token",
      }),
    );
    renderAuthForm();
    fireEvent.change(screen.getByPlaceholderText("Email"), {
      target: { value: "demo@taskmanager.dev" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "demo1234" },
    });
    fireEvent.click(screen.getByText("Resta connesso"));
    fireEvent.click(screen.getByText("Accedi"));

    await waitFor(() =>
      expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBe("signed-jwt-token"),
    );
  });
});
