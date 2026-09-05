import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import ImportCompanyFormComponent from "./importCompanyFormComponent";
import { AUTH_TOKEN_KEY } from "../../services/auth/authService";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

function makeExportFile(): File {
  const exportPayload = {
    company: { id: "1", name: "Acme", ownerId: "1" },
    users: [{ id: "1", username: "owner1", email: "owner@example.com", role: "owner" }],
    projects: [],
    projectAssignments: [],
    tasks: [],
    comments: [],
    backups: [],
  };
  return new File([JSON.stringify(exportPayload)], "export.json", { type: "application/json" });
}

function renderForm() {
  return render(
    <MemoryRouter>
      <ImportCompanyFormComponent />
    </MemoryRouter>,
  );
}

async function fillValidForm(): Promise<void> {
  const fileInput = screen.getByLabelText("File di export");
  fireEvent.change(fileInput, { target: { files: [makeExportFile()] } });
  fireEvent.change(screen.getByPlaceholderText("Password"), {
    target: { value: "Password1" },
  });
  fireEvent.change(screen.getByPlaceholderText("Conferma password"), {
    target: { value: "Password1" },
  });
}

describe("ImportCompanyFormComponent", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows inline validation errors when submitting without a file or password", async () => {
    renderForm();
    fireEvent.click(screen.getByText("Importa azienda"));

    expect(await screen.findByText("Seleziona un file di export.")).toBeInTheDocument();
    expect(
      screen.getByText(
        "La password deve contenere almeno 8 caratteri, una minuscola, una maiuscola e un numero.",
      ),
    ).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows a mismatch error when password and confirm password differ", async () => {
    renderForm();
    const fileInput = screen.getByLabelText("File di export");
    fireEvent.change(fileInput, { target: { files: [makeExportFile()] } });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "Password1" },
    });
    fireEvent.change(screen.getByPlaceholderText("Conferma password"), {
      target: { value: "Different1" },
    });
    fireEvent.click(screen.getByText("Importa azienda"));

    expect(await screen.findByText("Le password non coincidono.")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("calls POST /companies/import, persists the session and shows the recovery code on success", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(201, {
        user: { id: "1", username: "owner1", email: "owner@example.com", companyId: "10", role: "owner" },
        company: { id: "10", name: "Acme", ownerId: "1" },
        token: "signed-jwt-token",
        recoveryCode: "AAAA-BBBB-CCCC-DDDD",
        temporaryPasswords: [{ username: "dip1", role: "employee", password: "Temp1234" }],
      }),
    );
    renderForm();

    await fillValidForm();
    fireEvent.click(screen.getByText("Importa azienda"));

    await vi.waitFor(() =>
      expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBe("signed-jwt-token"),
    );
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/companies/import",
      expect.objectContaining({ method: "POST" }),
    );
    expect(await screen.findByText("AAAA-BBBB-CCCC-DDDD")).toBeInTheDocument();
  });

  it("shows a conflict error message on a 409 response without persisting the session", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(409, { message: "Username o email dell'export già in uso su questa istanza." }),
    );
    renderForm();

    await fillValidForm();
    fireEvent.click(screen.getByText("Importa azienda"));

    expect(
      await screen.findByText("Username o email dell'export già in uso su questa istanza."),
    ).toBeInTheDocument();
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
  });

  it("shows a validation error message on a 422 response", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(422, { message: "Il nome dell'azienda non può essere vuoto" }),
    );
    renderForm();

    await fillValidForm();
    fireEvent.click(screen.getByText("Importa azienda"));

    expect(
      await screen.findByText("Il nome dell'azienda non può essere vuoto"),
    ).toBeInTheDocument();
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
  });

  it("shows a readable error when the selected file is not valid JSON, without sending a request", async () => {
    renderForm();
    const fileInput = screen.getByLabelText("File di export");
    const invalidFile = new File(["not json"], "export.json", { type: "application/json" });
    fireEvent.change(fileInput, { target: { files: [invalidFile] } });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "Password1" },
    });
    fireEvent.change(screen.getByPlaceholderText("Conferma password"), {
      target: { value: "Password1" },
    });
    fireEvent.click(screen.getByText("Importa azienda"));

    expect(
      await screen.findByText("Il file selezionato non è un export valido."),
    ).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
});
