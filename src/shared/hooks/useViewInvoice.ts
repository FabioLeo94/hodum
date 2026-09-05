import { useNavigate } from "react-router";

/**
 * Naviga alla pagina fatture aprendo direttamente l'anteprima di una
 * pre-fattura (query string ?invoiceId=..., letta da invoices.tsx), chiudendo
 * prima la modale chiamante: stessa sequenza "chiudi poi naviga" duplicata in
 * taskFormModalComponent e taskDetailModalComponent per il bottone "Visualizza
 * fattura" di un task lockato.
 */
export function useViewInvoice() {
  const navigate = useNavigate();

  return function viewInvoice(invoiceId: string, onClose: () => void) {
    onClose();
    navigate(`/invoices?invoiceId=${invoiceId}`);
  };
}
