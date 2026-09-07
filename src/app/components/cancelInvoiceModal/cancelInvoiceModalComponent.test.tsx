import type { ComponentProps } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CancelInvoiceModalComponent from "./cancelInvoiceModalComponent";

function renderModal(props: Partial<ComponentProps<typeof CancelInvoiceModalComponent>> = {}) {
  return render(
    <CancelInvoiceModalComponent
      isOpen
      onClose={vi.fn()}
      invoiceNumber={7}
      onConfirm={vi.fn()}
      {...props}
    />,
  );
}

describe("CancelInvoiceModalComponent", () => {
  it("mostra il numero della pre-fattura nella descrizione", () => {
    renderModal();

    expect(screen.getByText(/#7/)).toBeInTheDocument();
  });

  it("il pulsante Indietro chiama onClose senza confermare", async () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    renderModal({ onClose, onConfirm });

    fireEvent.click(screen.getByRole("button", { name: "Indietro" }));

    expect(onClose).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("conferma chiama onConfirm", async () => {
    const onConfirm = vi.fn();
    renderModal({ onConfirm });

    fireEvent.click(screen.getByRole("button", { name: "Annulla pre-fattura" }));

    expect(onConfirm).toHaveBeenCalled();
  });

  it("mostra l'errore passato dal chiamante", () => {
    renderModal({ submitError: "Impossibile annullare la pre-fattura." });

    expect(screen.getByText("Impossibile annullare la pre-fattura.")).toBeInTheDocument();
  });
});
