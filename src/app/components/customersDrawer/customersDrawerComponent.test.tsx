import type { ComponentProps } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import CustomersDrawerComponent from "./customersDrawerComponent";
import type { Customer } from "../../../shared/types/customer";

vi.mock("../../services/customer/customerService", () => ({
  createCustomer: vi.fn(),
  deleteCustomer: vi.fn(),
  getAllCustomers: vi.fn(),
  updateCustomer: vi.fn(),
}));

// La lettura dello schedule aziendale (giorniLavorativi/orarioLavoro, per la
// conversione di unità in RateInputComponent) è una chiamata di sola lettura
// separata da quelle sui clienti: mockata a "non risolve mai" di default in
// ogni test, RateInputComponent resta semplicemente con le unità non orarie
// disabilitate, irrilevante per le asserzioni su nome/descrizione/CRUD.
vi.mock("../../services/company/companyService", () => ({
  getCompany: vi.fn(),
}));

import {
  createCustomer,
  deleteCustomer,
  getAllCustomers,
  updateCustomer,
} from "../../services/customer/customerService";
import { getCompany } from "../../services/company/companyService";

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: "customer-1",
    companyId: "company-1",
    name: "Cliente Uno",
    description: "Una nota",
    createdAt: "2026-01-01T00:00:00.000Z",
    lastInvoicedAt: null,
    tariffaOraria: null,
    tariffaUnita: null,
    valuta: null,
    ...overrides,
  };
}

function renderDrawer(props: Partial<ComponentProps<typeof CustomersDrawerComponent>> = {}) {
  return render(
    <CustomersDrawerComponent isOpen onClose={vi.fn()} companyId="company-1" {...props} />,
  );
}

beforeEach(() => {
  vi.mocked(getAllCustomers).mockReset();
  vi.mocked(createCustomer).mockReset();
  vi.mocked(updateCustomer).mockReset();
  vi.mocked(deleteCustomer).mockReset();
  vi.mocked(getCompany).mockReset();
  vi.mocked(getCompany).mockResolvedValue(undefined);
});

describe("CustomersDrawerComponent", () => {
  it("carica ed elenca i clienti all'apertura", async () => {
    vi.mocked(getAllCustomers).mockResolvedValue([makeCustomer()]);

    renderDrawer();

    const card = (await screen.findByText("Cliente Uno")).closest("button");
    expect(card).not.toBeNull();
    // Il pannello form resta sempre montato accanto alla lista (per la
    // transizione a scorrimento) e mostra anch'esso "Mai fatturato" come
    // hint statico: la verifica va quindi scoperta al contenuto della sola
    // card, non cercata nell'intero documento.
    expect(within(card as HTMLElement).getByText("Una nota")).toBeInTheDocument();
    expect(within(card as HTMLElement).getByText("Mai fatturato")).toBeInTheDocument();
  });

  it("mostra il messaggio di lista vuota quando non ci sono clienti", async () => {
    vi.mocked(getAllCustomers).mockResolvedValue([]);

    renderDrawer();

    expect(await screen.findByText("Nessun cliente registrato.")).toBeInTheDocument();
  });

  it("crea un nuovo cliente dal form e torna alla lista", async () => {
    vi.mocked(getAllCustomers).mockResolvedValue([]);
    vi.mocked(createCustomer).mockResolvedValue(makeCustomer({ name: "Nuovo Cliente" }));

    renderDrawer();
    await screen.findByText("Nessun cliente registrato.");

    fireEvent.click(screen.getByRole("button", { name: "Nuovo cliente" }));
    fireEvent.change(screen.getByLabelText("Nome cliente"), { target: { value: "Nuovo Cliente" } });
    vi.mocked(getAllCustomers).mockResolvedValue([makeCustomer({ name: "Nuovo Cliente" })]);

    fireEvent.click(screen.getByRole("button", { name: "Salva" }));

    await waitFor(() => {
      expect(createCustomer).toHaveBeenCalledWith({
        name: "Nuovo Cliente",
        description: null,
        tariffaOraria: null,
        tariffaUnita: null,
        valuta: null,
      });
    });
    expect(await screen.findByText("Nuovo Cliente")).toBeInTheDocument();
  });

  it("rifiuta il salvataggio con nome vuoto", async () => {
    vi.mocked(getAllCustomers).mockResolvedValue([]);

    renderDrawer();
    await screen.findByText("Nessun cliente registrato.");

    fireEvent.click(screen.getByRole("button", { name: "Nuovo cliente" }));
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));

    expect(await screen.findByText("Il nome del cliente non può essere vuoto.")).toBeInTheDocument();
    expect(createCustomer).not.toHaveBeenCalled();
  });

  it("apre un cliente esistente, lo modifica e torna alla lista", async () => {
    const existing = makeCustomer();
    vi.mocked(getAllCustomers).mockResolvedValue([existing]);
    vi.mocked(updateCustomer).mockResolvedValue({ ...existing, name: "Cliente Modificato" });

    renderDrawer();
    fireEvent.click(await screen.findByText("Cliente Uno"));

    const nameInput = await screen.findByLabelText("Nome cliente");
    expect(nameInput).toHaveValue("Cliente Uno");
    fireEvent.change(nameInput, { target: { value: "Cliente Modificato" } });

    vi.mocked(getAllCustomers).mockResolvedValue([{ ...existing, name: "Cliente Modificato" }]);
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));

    await waitFor(() => {
      expect(updateCustomer).toHaveBeenCalledWith("customer-1", {
        name: "Cliente Modificato",
        description: "Una nota",
        tariffaOraria: null,
        tariffaUnita: null,
        valuta: null,
      });
    });
    expect(await screen.findByText("Cliente Modificato")).toBeInTheDocument();
  });

  it("elimina un cliente dopo conferma e torna alla lista", async () => {
    const existing = makeCustomer();
    vi.mocked(getAllCustomers).mockResolvedValue([existing]);
    vi.mocked(deleteCustomer).mockResolvedValue(undefined);

    renderDrawer();
    fireEvent.click(await screen.findByText("Cliente Uno"));

    fireEvent.click(await screen.findByRole("button", { name: "Elimina cliente" }));
    vi.mocked(getAllCustomers).mockResolvedValue([]);
    fireEvent.click(screen.getByRole("button", { name: "Elimina" }));

    await waitFor(() => {
      expect(deleteCustomer).toHaveBeenCalledWith("customer-1");
    });
    expect(await screen.findByText("Nessun cliente registrato.")).toBeInTheDocument();
  });

  it("Indietro torna alla lista senza salvare", async () => {
    vi.mocked(getAllCustomers).mockResolvedValue([makeCustomer()]);

    renderDrawer();
    fireEvent.click(await screen.findByText("Cliente Uno"));
    await screen.findByLabelText("Nome cliente");

    fireEvent.click(screen.getByRole("button", { name: "Indietro" }));

    expect(screen.getByText("Cliente Uno")).toBeInTheDocument();
    expect(createCustomer).not.toHaveBeenCalled();
    expect(updateCustomer).not.toHaveBeenCalled();
  });
});
