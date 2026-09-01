import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import TopbarComponent from "./topbarComponent";
import { AUTH_TOKEN_KEY, AUTH_USER_KEY } from "../../services/auth/authService";

function renderTopbar(
  onLogout: () => void = () => {},
  initialPath: string = "/",
) {
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <TopbarComponent onLogout={onLogout} />
    </MemoryRouter>,
  );
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

function storeUser(role: "owner" | "manager" | "employee") {
  sessionStorage.setItem(AUTH_TOKEN_KEY, "signed-jwt-token");
  sessionStorage.setItem(
    AUTH_USER_KEY,
    JSON.stringify({
      id: "1",
      username: "mario",
      email: "mario@example.com",
      companyId: "10",
      role,
      mustChangePassword: false,
    }),
  );
}

describe("TopbarComponent", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("does not render the employees link when there is no authenticated owner", () => {
    renderTopbar();
    expect(
      screen.queryByRole("link", { name: "Dipendenti" }),
    ).not.toBeInTheDocument();
  });

  it("does not render the employees link for an employee", () => {
    storeUser("employee");
    renderTopbar();
    expect(
      screen.queryByRole("link", { name: "Dipendenti" }),
    ).not.toBeInTheDocument();
  });

  it("renders a link to /employees for an owner", () => {
    storeUser("owner");
    renderTopbar();
    expect(screen.getByRole("link", { name: "Dipendenti" })).toHaveAttribute(
      "href",
      "/employees",
    );
  });

  it("renders a link to /employees for a manager", () => {
    storeUser("manager");
    renderTopbar();
    expect(screen.getByRole("link", { name: "Dipendenti" })).toHaveAttribute(
      "href",
      "/employees",
    );
  });

  it("renders a link to /dashboard when not on the dashboard page", () => {
    renderTopbar(() => {}, "/employees");
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
  });

  it("renders Dashboard as a non-clickable current item when on the dashboard page", () => {
    renderTopbar(() => {}, "/dashboard");
    expect(
      screen.queryByRole("link", { name: "Dashboard" }),
    ).not.toBeInTheDocument();
    const activeItem = screen.getByText("Dashboard");
    expect(activeItem.tagName.toLowerCase()).toBe("span");
    expect(activeItem).toHaveAttribute("aria-current", "page");
  });

  it("renders Dipendenti as a non-clickable current item when on the employees page", () => {
    storeUser("owner");
    renderTopbar(() => {}, "/employees");
    expect(
      screen.queryByRole("link", { name: "Dipendenti" }),
    ).not.toBeInTheDocument();
    const activeItem = screen.getByText("Dipendenti");
    expect(activeItem.tagName.toLowerCase()).toBe("span");
    expect(activeItem).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
  });

  it("renders the logo and the account button, with the menu closed", () => {
    renderTopbar();

    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName.toLowerCase() === "span" &&
          element?.textContent === "Hodum",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Menu account" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("opens the menu with the Disconnetti option when the account button is clicked", () => {
    renderTopbar();

    fireEvent.click(screen.getByRole("button", { name: "Menu account" }));

    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Disconnetti" }),
    ).toBeInTheDocument();
  });

  it("toggles the menu closed when the account button is clicked again", () => {
    renderTopbar();
    const accountButton = screen.getByRole("button", { name: "Menu account" });

    fireEvent.click(accountButton);
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.click(accountButton);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("calls onLogout and closes the menu when Disconnetti is clicked", () => {
    const onLogout = vi.fn();
    renderTopbar(onLogout);

    fireEvent.click(screen.getByRole("button", { name: "Menu account" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Disconnetti" }));

    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes the menu when Escape is pressed", () => {
    renderTopbar();

    fireEvent.click(screen.getByRole("button", { name: "Menu account" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes the menu when clicking outside of it", () => {
    render(
      <MemoryRouter>
        <TopbarComponent onLogout={() => {}} />
        <button>Fuori</button>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Menu account" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByText("Fuori"));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  describe("menu Progetti", () => {
    beforeEach(() => {
      vi.stubGlobal("fetch", vi.fn());
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("non fa alcuna richiesta finché il menu non viene aperto", () => {
      renderTopbar();
      expect(fetch).not.toHaveBeenCalled();
    });

    it("apre il menu e mostra i progetti al click sul bottone", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(200, [
          { id: "1", name: "Progetto Alpha", isActive: true },
          { id: "2", name: "Progetto Beta", isActive: true },
        ]),
      );
      renderTopbar();

      fireEvent.click(screen.getByRole("button", { name: /Progetti/ }));

      expect(await screen.findByRole("menuitem", { name: "Progetto Alpha" })).toHaveAttribute(
        "href",
        "/dashboard/1/task-list",
      );
      expect(screen.getByRole("menuitem", { name: "Progetto Beta" })).toBeInTheDocument();
    });

    it("mostra un messaggio quando non ci sono progetti", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse(200, []));
      renderTopbar();

      fireEvent.click(screen.getByRole("button", { name: /Progetti/ }));

      expect(await screen.findByText("Nessun progetto")).toBeInTheDocument();
    });

    it("mostra un errore quando il caricamento fallisce", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse(500, { message: "Errore server" }));
      renderTopbar();

      fireEvent.click(screen.getByRole("button", { name: /Progetti/ }));

      expect(await screen.findByRole("alert")).toHaveTextContent("Errore server");
    });

    it("chiude il menu e naviga al click su un progetto", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(200, [{ id: "1", name: "Progetto Alpha", isActive: true }]),
      );
      renderTopbar();

      fireEvent.click(screen.getByRole("button", { name: /Progetti/ }));
      fireEvent.click(await screen.findByRole("menuitem", { name: "Progetto Alpha" }));

      expect(screen.queryByRole("menu", { name: "Progetti" })).not.toBeInTheDocument();
    });

    it("chiude il menu Progetti quando si preme Escape", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse(200, []));
      renderTopbar();

      fireEvent.click(screen.getByRole("button", { name: /Progetti/ }));
      expect(await screen.findByText("Nessun progetto")).toBeInTheDocument();

      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByRole("menu", { name: "Progetti" })).not.toBeInTheDocument();
    });
  });

  describe("nome del progetto attivo", () => {
    beforeEach(() => {
      vi.stubGlobal("fetch", vi.fn());
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("non mostra alcuna etichetta fuori da una pagina di progetto", () => {
      renderTopbar(() => {}, "/dashboard");
      expect(fetch).not.toHaveBeenCalled();
    });

    it("mostra il nome del progetto quando risolto, integrato nel bottone Progetti", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(200, { id: "1", name: "Progetto Alpha", isActive: true }),
      );
      renderTopbar(() => {}, "/dashboard/1/task-list");

      expect(
        await screen.findByRole("button", { name: /Progetti\s*—\s*Progetto Alpha/ }),
      ).toBeInTheDocument();
    });

    it("mostra un placeholder mentre il nome è in corso di risoluzione", () => {
      vi.mocked(fetch).mockReturnValue(new Promise(() => {}));
      renderTopbar(() => {}, "/dashboard/1/task-list");

      expect(
        screen.getByRole("button", { name: /Progetti\s*—\s*Progetto$/ }),
      ).toBeInTheDocument();
    });
  });
});
