import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import InvoicePreviewComponent from "./invoicePreviewComponent";

vi.mock("../../services/invoice/invoiceService", () => ({
  getInvoicePdfBlobUrl: vi.fn(),
}));

import { getInvoicePdfBlobUrl } from "../../services/invoice/invoiceService";

beforeEach(() => {
  vi.mocked(getInvoicePdfBlobUrl).mockReset();
  // jsdom non implementa URL.revokeObjectURL (lancia "not implemented"),
  // stesso motivo per cui downloadJsonFile.test.ts la mocka: qui serve solo
  // per verificare che venga chiamata, non il suo comportamento reale.
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("InvoicePreviewComponent", () => {
  it("mostra lo stato di caricamento e poi l'iframe con il PDF", async () => {
    vi.mocked(getInvoicePdfBlobUrl).mockResolvedValue("blob:mock-url");

    render(<InvoicePreviewComponent invoiceId="invoice-1" onClose={vi.fn()} />);

    expect(screen.getByRole("status")).toHaveTextContent("Caricamento del PDF...");

    const frame = await screen.findByTitle("PDF della pre-fattura");
    expect(frame).toHaveAttribute("src", "blob:mock-url");
  });

  it("mostra l'errore se il caricamento del PDF fallisce", async () => {
    vi.mocked(getInvoicePdfBlobUrl).mockRejectedValue(new Error("Fattura non trovata"));

    render(<InvoicePreviewComponent invoiceId="invoice-1" onClose={vi.fn()} />);

    expect(await screen.findByText("Fattura non trovata")).toBeInTheDocument();
  });

  it("chiama onClose quando si clicca Chiudi", async () => {
    const onClose = vi.fn();
    vi.mocked(getInvoicePdfBlobUrl).mockResolvedValue("blob:mock-url");

    render(<InvoicePreviewComponent invoiceId="invoice-1" onClose={onClose} />);
    await screen.findByTitle("PDF della pre-fattura");

    // Due bottoni condividono il nome accessibile "Chiudi": la X del
    // chrome nativo di ModalBaseComponent (topBar) e l'azione primaria di
    // questo componente (bottomBar). Quest'ultima è la seconda nell'ordine
    // del DOM.
    const closeButtons = screen.getAllByRole("button", { name: "Chiudi" });
    fireEvent.click(closeButtons[closeButtons.length - 1]);

    expect(onClose).toHaveBeenCalled();
  });

  it("revoca l'URL del blob allo smontaggio", async () => {
    vi.mocked(getInvoicePdfBlobUrl).mockResolvedValue("blob:mock-url");

    const { unmount } = render(<InvoicePreviewComponent invoiceId="invoice-1" onClose={vi.fn()} />);
    await screen.findByTitle("PDF della pre-fattura");

    unmount();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });
});
