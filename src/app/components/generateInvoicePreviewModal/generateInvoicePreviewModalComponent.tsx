import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import ModalBaseComponent from "../modalBase/modalBaseComponent";
import ButtonComponent from "../button/buttonComponent";
import { generateInvoice, previewInvoicePdfBlobUrl } from "../../services/invoice/invoiceService";
import type { TaskSelection } from "../../services/invoice/invoiceService";
import { notifySuccess } from "../../services/notify/notifyService";
import { useAsyncSubmit } from "../../../shared/hooks/useAsyncSubmit";
import styles from "./generateInvoicePreviewModalComponent.module.css";

interface Prop {
  isOpen: boolean;
  customerId: string;
  taskSelections: TaskSelection[];
  // Chiude la preview e torna al drawer di generazione senza confermare
  // (bottone "Modifica" e chiusura generica del dialog, es. Escape/backdrop):
  // il drawer resta montato sotto con la selezione intatta.
  onEdit: () => void;
  // Chiamato SOLO dopo che generateInvoice ha avuto successo: il chiamante
  // (GenerateInvoiceDrawerComponent) chiude sia questa preview sia il drawer
  // e ricarica la lista, stessa sequenza di handleGenerate prima di questo
  // step intermedio.
  onConfirmed: () => void;
}

// Step di anteprima prima della conferma (task 13 del backlog UI): stesso
// caricamento PDF di InvoicePreviewComponent (loading/error/blob-url +
// revoke-on-unmount) ma la sorgente è previewInvoicePdfBlobUrl (nessuna
// invoice persistita ancora, il PDF è generato al volo dal backend) e le
// azioni sono diverse — "Modifica" torna al drawer, "Conferma pre-fattura"
// esegue davvero generateInvoice.
function GenerateInvoicePreviewModalComponent({
  isOpen,
  customerId,
  taskSelections,
  onEdit,
  onConfirmed,
}: Prop) {
  const { t } = useTranslation();
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const { isSubmitting, submit } = useAsyncSubmit();

  // Reset sincrono durante il render (non nell'effect sotto, vietato dalla
  // regola react-hooks/set-state-in-effect): stesso pattern "confronta col
  // valore precedente" di GenerateInvoiceDrawerComponent per il proprio
  // isOpen, qui serve perché la preview può riaprirsi più volte per lo stesso
  // drawer (una selezione modificata dopo "Modifica").
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setIsLoading(true);
      setLoadError("");
      setConfirmError("");
    }
  }

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    previewInvoicePdfBlobUrl(customerId, taskSelections)
      .then((url) => {
        if (cancelled) {
          // Stesso motivo del ramo equivalente in InvoicePreviewComponent:
          // risposta arrivata dopo la chiusura, il blob non ha più un
          // consumatore.
          URL.revokeObjectURL(url);
          return;
        }
        setPdfUrl(url);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : t("components.generateInvoicePreviewModal.loadError"),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // taskSelections è una dipendenza sicura: il chiamante (GenerateInvoiceDrawerComponent)
    // la congela in uno state al momento dell'apertura, non la ricalcola ad
    // ogni render, quindi la sua identità cambia solo quando la preview va
    // davvero ricaricata.
  }, [isOpen, customerId, taskSelections, t]);

  // Effect separato agganciato a pdfUrl, stesso motivo di
  // InvoicePreviewComponent: revoca l'URL creato sopra sia allo smontaggio
  // sia se mai venisse rimpiazzato.
  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  async function handleConfirm() {
    setConfirmError("");
    await submit(async () => {
      try {
        await generateInvoice(customerId, taskSelections);
        notifySuccess(t("components.generateInvoicePreviewModal.confirmSuccess"));
        onConfirmed();
      } catch (error) {
        setConfirmError(
          error instanceof Error ? error.message : t("components.generateInvoicePreviewModal.confirmError"),
        );
        throw error;
      }
    });
  }

  return (
    <ModalBaseComponent
      isOpen={isOpen}
      onClose={onEdit}
      title={t("components.generateInvoicePreviewModal.title")}
      size="wide"
      primaryAction={
        <ButtonComponent onClick={handleConfirm} disabled={isSubmitting || isLoading || !!loadError}>
          {isSubmitting
            ? t("components.generateInvoicePreviewModal.confirming")
            : t("components.generateInvoicePreviewModal.confirm")}
        </ButtonComponent>
      }
      secondaryActions={
        <button type="button" className={styles.editButton} onClick={onEdit}>
          {t("components.generateInvoicePreviewModal.edit")}
        </button>
      }
    >
      <div className={styles.previewArea}>
        {loadError ? (
          <p role="alert" className={styles.errorBanner}>
            {loadError}
          </p>
        ) : isLoading ? (
          <p role="status" className={styles.statusText}>
            {t("components.generateInvoicePreviewModal.loading")}
          </p>
        ) : (
          pdfUrl && (
            <iframe
              className={styles.pdfFrame}
              src={pdfUrl}
              title={t("components.generateInvoicePreviewModal.frameTitle")}
            />
          )
        )}
      </div>
      {confirmError && (
        <p role="alert" className={styles.errorBanner}>
          {confirmError}
        </p>
      )}
    </ModalBaseComponent>
  );
}

export default GenerateInvoicePreviewModalComponent;
