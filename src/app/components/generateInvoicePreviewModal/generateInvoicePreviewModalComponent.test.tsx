import type { ComponentProps } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import GenerateInvoicePreviewModalComponent from "./generateInvoicePreviewModalComponent";

vi.mock("../../services/invoice/invoiceService", () => ({
  generateInvoice: vi.fn(),
  previewInvoicePdfBlobUrl: vi.fn(),
}));

vi.mock("../../services/notify/notifyService", () => ({
  notifySuccess: vi.fn(),
}));

import { generateInvoice, previewInvoicePdfBlobUrl } from "../../services/invoice/invoiceService";
import { notifySuccess } from "../../services/notify/notifyService";

const TASK_SELECTIONS = [{ taskId: "task-1", nonFatturabile: false }];

function renderModal(props: Partial<ComponentProps<typeof GenerateInvoicePreviewModalComponent>> = {}) {
  return render(
    <GenerateInvoicePreviewModalComponent
      isOpen
      customerId="customer-1"
      taskSelections={TASK_SELECTIONS}
      onEdit={vi.fn()}
      onConfirmed={vi.fn()}
      {...props}
    />,
  );
}

beforeEach(() => {
  vi.mocked(previewInvoicePdfBlobUrl).mockReset();
  vi.mocked(generateInvoice).mockReset();
  vi.mocked(notifySuccess).mockReset();
  // Stesso motivo di invoicePreviewComponent.test.tsx: previewInvoicePdfBlobUrl
  // è mockata per intero (URL.createObjectURL non viene mai chiamata
  // davvero), ma il cleanup del componente chiama comunque
  // URL.revokeObjectURL, non implementata da jsdom.
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.mocked(previewInvoicePdfBlobUrl).mockResolvedValue("blob:preview-url");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GenerateInvoicePreviewModalComponent", () => {
  it("carica l'anteprima PDF della selezione corrente", async () => {
    renderModal();

    await waitFor(() => {
      expect(previewInvoicePdfBlobUrl).toHaveBeenCalledWith("customer-1", TASK_SELECTIONS);
    });
    expect(await screen.findByTitle("Anteprima PDF della pre-fattura")).toHaveAttribute(
      "src",
      "blob:preview-url",
    );
  });

  it("'Modifica' chiama onEdit senza generare la pre-fattura", async () => {
    const onEdit = vi.fn();
    renderModal({ onEdit });
    await screen.findByTitle("Anteprima PDF della pre-fattura");

    fireEvent.click(screen.getByRole("button", { name: "Modifica" }));

    expect(onEdit).toHaveBeenCalled();
    expect(generateInvoice).not.toHaveBeenCalled();
  });

  it("'Conferma pre-fattura' genera davvero la pre-fattura e notifica onConfirmed", async () => {
    const onConfirmed = vi.fn();
    vi.mocked(generateInvoice).mockResolvedValue({
      id: "invoice-1",
      companyId: "company-1",
      customerId: "customer-1",
      numero: 1,
      dataGenerazione: "2026-01-01T00:00:00.000Z",
      totaleSecondi: 3600,
      totaleImporto: 50,
      cancelledAt: null,
    });
    renderModal({ onConfirmed });
    await screen.findByTitle("Anteprima PDF della pre-fattura");

    fireEvent.click(screen.getByRole("button", { name: "Conferma pre-fattura" }));

    await waitFor(() => {
      expect(generateInvoice).toHaveBeenCalledWith("customer-1", TASK_SELECTIONS);
    });
    expect(notifySuccess).toHaveBeenCalled();
    expect(onConfirmed).toHaveBeenCalled();
  });

  it("mostra l'errore del backend senza chiamare onConfirmed se la conferma fallisce", async () => {
    const onConfirmed = vi.fn();
    vi.mocked(generateInvoice).mockRejectedValue(new Error("Un task selezionato non è più fatturabile."));
    renderModal({ onConfirmed });
    await screen.findByTitle("Anteprima PDF della pre-fattura");

    fireEvent.click(screen.getByRole("button", { name: "Conferma pre-fattura" }));

    expect(await screen.findByText("Un task selezionato non è più fatturabile.")).toBeInTheDocument();
    expect(onConfirmed).not.toHaveBeenCalled();
  });
});
