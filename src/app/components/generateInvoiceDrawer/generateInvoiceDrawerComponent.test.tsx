import type { ComponentProps } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import GenerateInvoiceDrawerComponent from "./generateInvoiceDrawerComponent";

vi.mock("../../services/customer/customerService", () => ({
  listCustomerSummaries: vi.fn(),
}));

vi.mock("../../services/invoice/invoiceService", () => ({
  generateInvoice: vi.fn(),
  listBillableTasks: vi.fn(),
}));

import { listCustomerSummaries } from "../../services/customer/customerService";
import { generateInvoice, listBillableTasks } from "../../services/invoice/invoiceService";

function renderDrawer(props: Partial<ComponentProps<typeof GenerateInvoiceDrawerComponent>> = {}) {
  return render(
    <GenerateInvoiceDrawerComponent isOpen onClose={vi.fn()} onGenerated={vi.fn()} {...props} />,
  );
}

async function selectCustomer() {
  await screen.findByRole("option", { name: "Cliente Uno" });
  fireEvent.change(screen.getByLabelText("Cliente"), { target: { value: "customer-1" } });
  return screen.findByText("Task Uno");
}

beforeEach(() => {
  vi.mocked(listCustomerSummaries).mockReset();
  vi.mocked(listBillableTasks).mockReset();
  vi.mocked(generateInvoice).mockReset();
  vi.mocked(listCustomerSummaries).mockResolvedValue([{ id: "customer-1", name: "Cliente Uno" }]);
  vi.mocked(listBillableTasks).mockResolvedValue([
    {
      id: "task-1",
      title: "Task Uno",
      workAccumulatedSeconds: 3600,
      projectId: "project-1",
      projectName: "Progetto Uno",
    },
  ]);
});

describe("GenerateInvoiceDrawerComponent", () => {
  it("carica ed elenca i clienti all'apertura", async () => {
    renderDrawer();

    expect(await screen.findByRole("option", { name: "Cliente Uno" })).toBeInTheDocument();
  });

  it("seleziona un cliente e mostra i suoi task fatturabili", async () => {
    renderDrawer();

    await selectCustomer();

    expect(screen.getByText("Progetto Uno")).toBeInTheDocument();
    expect(screen.getByText("1:00:00")).toBeInTheDocument();
  });

  it("disabilita 'Genera pre-fattura' e la checkbox non fatturabile finché il task non è incluso", async () => {
    renderDrawer();
    await selectCustomer();

    expect(screen.getByRole("button", { name: "Genera pre-fattura" })).toBeDisabled();
    expect(screen.getByLabelText("Segna Task Uno come non fatturabile")).toBeDisabled();

    fireEvent.click(screen.getByLabelText("Includi Task Uno nella pre-fattura"));

    expect(screen.getByRole("button", { name: "Genera pre-fattura" })).toBeEnabled();
    expect(screen.getByLabelText("Segna Task Uno come non fatturabile")).toBeEnabled();
  });

  it("genera la pre-fattura con la selezione corrente, chiude il drawer e notifica il chiamante", async () => {
    const onClose = vi.fn();
    const onGenerated = vi.fn();
    vi.mocked(generateInvoice).mockResolvedValue({
      id: "invoice-1",
      companyId: "company-1",
      customerId: "customer-1",
      numero: 1,
      dataGenerazione: "2026-01-01T00:00:00.000Z",
      totaleSecondi: 3600,
      totaleImporto: 50,
    });

    renderDrawer({ onClose, onGenerated });
    await selectCustomer();
    fireEvent.click(screen.getByLabelText("Includi Task Uno nella pre-fattura"));
    fireEvent.click(screen.getByLabelText("Segna Task Uno come non fatturabile"));

    fireEvent.click(screen.getByRole("button", { name: "Genera pre-fattura" }));

    await waitFor(() => {
      expect(generateInvoice).toHaveBeenCalledWith("customer-1", [
        { taskId: "task-1", nonFatturabile: true },
      ]);
    });
    expect(onClose).toHaveBeenCalled();
    expect(onGenerated).toHaveBeenCalled();
  });

  it("mostra l'errore del backend senza chiudere il drawer se la generazione fallisce", async () => {
    const onClose = vi.fn();
    vi.mocked(generateInvoice).mockRejectedValue(
      new Error("Generazione già in corso per l'azienda."),
    );

    renderDrawer({ onClose });
    await selectCustomer();
    fireEvent.click(screen.getByLabelText("Includi Task Uno nella pre-fattura"));

    fireEvent.click(screen.getByRole("button", { name: "Genera pre-fattura" }));

    expect(await screen.findByText("Generazione già in corso per l'azienda.")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
