import type { ComponentProps } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import GenerateInvoiceDrawerComponent from "./generateInvoiceDrawerComponent";

vi.mock("../../services/customer/customerService", () => ({
  listCustomerSummaries: vi.fn(),
}));

vi.mock("../../services/invoice/invoiceService", () => ({
  listBillableTasks: vi.fn(),
  generateInvoice: vi.fn(),
  previewInvoicePdfBlobUrl: vi.fn(),
}));

vi.mock("../../services/notify/notifyService", () => ({
  notifySuccess: vi.fn(),
}));

import { listCustomerSummaries } from "../../services/customer/customerService";
import { listBillableTasks, previewInvoicePdfBlobUrl } from "../../services/invoice/invoiceService";

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

const TWO_TASKS = [
  {
    id: "task-1",
    title: "Task Uno",
    workAccumulatedSeconds: 3600,
    projectId: "project-1",
    projectName: "Progetto Uno",
  },
  {
    id: "task-2",
    title: "Task Due",
    workAccumulatedSeconds: 1800,
    projectId: "project-1",
    projectName: "Progetto Uno",
  },
];

const TWO_PROJECTS_TASKS = [
  {
    id: "task-1",
    title: "Task Uno",
    workAccumulatedSeconds: 3600,
    projectId: "project-1",
    projectName: "Progetto Uno",
  },
  {
    id: "task-2",
    title: "Task Due",
    workAccumulatedSeconds: 1800,
    projectId: "project-2",
    projectName: "Progetto Due",
  },
];

beforeEach(() => {
  vi.mocked(listCustomerSummaries).mockReset();
  vi.mocked(listBillableTasks).mockReset();
  vi.mocked(previewInvoicePdfBlobUrl).mockReset();
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
  // Mai risolta di default: le anteprime restano "in caricamento" finché un
  // test non la valorizza esplicitamente, così i test che verificano solo
  // l'APERTURA della preview non dipendono dall'esito del suo caricamento.
  vi.mocked(previewInvoicePdfBlobUrl).mockReturnValue(new Promise(() => {}));
});

describe("GenerateInvoiceDrawerComponent", () => {
  it("carica ed elenca i clienti all'apertura", async () => {
    renderDrawer();

    expect(await screen.findByRole("option", { name: "Cliente Uno" })).toBeInTheDocument();
  });

  it("seleziona un cliente e mostra i suoi task fatturabili", async () => {
    renderDrawer();

    await selectCustomer();

    expect(screen.getAllByText("Progetto Uno").length).toBeGreaterThan(0);
    // ElapsedDurationBadgeComponent spezza il valore in segmenti separati
    // (00 01:00:00): 3600s = 1 ora esatta, il segmento ore è "01".
    // getByTitle normalizza gli spazi bianchi ("\n" -> " "), quindi qui si
    // legge l'attributo title grezzo per verificare gli a-capo del tooltip.
    expect(document.querySelector("[title]")).toHaveAttribute(
      "title",
      "giorni: 0\nore: 1\nminuti: 0\nsecondi: 0",
    );
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

  it("apre l'anteprima con la selezione corrente invece di generare direttamente", async () => {
    renderDrawer();
    await selectCustomer();
    fireEvent.click(screen.getByLabelText("Includi Task Uno nella pre-fattura"));
    fireEvent.click(screen.getByLabelText("Segna Task Uno come non fatturabile"));

    fireEvent.click(screen.getByRole("button", { name: "Genera pre-fattura" }));

    expect(await screen.findByRole("heading", { name: "Anteprima pre-fattura" })).toBeInTheDocument();
    expect(previewInvoicePdfBlobUrl).toHaveBeenCalledWith("customer-1", [
      { taskId: "task-1", nonFatturabile: true },
    ]);
  });

  it("'Modifica' chiude la preview e riporta al drawer senza chiudere né notificare il chiamante", async () => {
    const onClose = vi.fn();
    const onGenerated = vi.fn();
    renderDrawer({ onClose, onGenerated });
    await selectCustomer();
    fireEvent.click(screen.getByLabelText("Includi Task Uno nella pre-fattura"));
    fireEvent.click(screen.getByRole("button", { name: "Genera pre-fattura" }));
    await screen.findByRole("heading", { name: "Anteprima pre-fattura" });

    fireEvent.click(screen.getByRole("button", { name: "Modifica" }));

    expect(screen.queryByRole("heading", { name: "Anteprima pre-fattura" })).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(onGenerated).not.toHaveBeenCalled();
  });

  it("la checkbox 'seleziona tutto' riflette lo stato pieno/parziale/vuoto e alterna la selezione", async () => {
    vi.mocked(listBillableTasks).mockResolvedValue(TWO_TASKS);
    renderDrawer();
    await selectCustomer();
    await screen.findByText("Task Due");

    const selectAll = screen.getByLabelText("Seleziona tutti i task fatturabili") as HTMLInputElement;
    expect(selectAll.checked).toBe(false);
    expect(selectAll.indeterminate).toBe(false);

    fireEvent.click(screen.getByLabelText("Includi Task Uno nella pre-fattura"));
    expect(selectAll.checked).toBe(false);
    expect(selectAll.indeterminate).toBe(true);

    fireEvent.click(screen.getByLabelText("Includi Task Due nella pre-fattura"));
    expect(selectAll.checked).toBe(true);
    expect(selectAll.indeterminate).toBe(false);

    fireEvent.click(selectAll);
    expect(screen.getByLabelText("Includi Task Uno nella pre-fattura")).not.toBeChecked();
    expect(screen.getByLabelText("Includi Task Due nella pre-fattura")).not.toBeChecked();

    fireEvent.click(selectAll);
    expect(screen.getByLabelText("Includi Task Uno nella pre-fattura")).toBeChecked();
    expect(screen.getByLabelText("Includi Task Due nella pre-fattura")).toBeChecked();
  });

  it("filtra i task per progetto e resetta la selezione quando cambia il filtro", async () => {
    vi.mocked(listBillableTasks).mockResolvedValue(TWO_PROJECTS_TASKS);
    renderDrawer();
    await selectCustomer();
    await screen.findByText("Task Due");

    fireEvent.click(screen.getByLabelText("Includi Task Uno nella pre-fattura"));
    expect(screen.getByRole("button", { name: "Genera pre-fattura" })).toBeEnabled();

    fireEvent.change(screen.getByLabelText("Progetto"), { target: { value: "project-2" } });

    expect(screen.queryByText("Task Uno")).not.toBeInTheDocument();
    expect(screen.getByText("Task Due")).toBeInTheDocument();
    // Cambiare progetto resetta la selezione fatta sul progetto precedente.
    expect(screen.getByRole("button", { name: "Genera pre-fattura" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Progetto"), { target: { value: "" } });

    expect(screen.getByText("Task Uno")).toBeInTheDocument();
    expect(screen.getByText("Task Due")).toBeInTheDocument();
  });
});
