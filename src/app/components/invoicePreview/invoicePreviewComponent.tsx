import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import ModalBaseComponent from "../modalBase/modalBaseComponent";
import ButtonComponent from "../button/buttonComponent";
import { getInvoicePdfBlobUrl } from "../../services/invoice/invoiceService";
import styles from "./invoicePreviewComponent.module.css";

interface Prop {
  invoiceId: string;
  onClose: () => void;
}

// Anteprima PDF di una pre-fattura (GET /invoices/{id}/pdf, uno stream
// binario, non un endpoint tsoa/JSON: vedi invoiceService.getInvoicePdfBlobUrl).
// Il chiamante (invoices.tsx) monta questo componente con key={invoiceId}:
// cambiare invoice mentre l'anteprima è aperta (es. un'altra riga cliccata)
// rimonta un'istanza fresca invece di dover risincronizzare isLoading/
// loadError con un effect, stesso pattern già usato da TaskCommentsPanelComponent.
function InvoicePreviewComponent({ invoiceId, onClose }: Prop) {
  const { t } = useTranslation();
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;

    getInvoicePdfBlobUrl(invoiceId)
      .then((url) => {
        if (cancelled) {
          // La risposta è arrivata dopo lo smontaggio (o dopo un cambio di
          // invoiceId, impossibile qui dato il remount via key, ma la
          // guardia resta corretta anche solo per lo smontaggio): il blob
          // non ha più un consumatore, va revocato subito invece di
          // aspettare l'effect di pulizia sotto (che non gira più).
          URL.revokeObjectURL(url);
          return;
        }
        setPdfUrl(url);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : t("components.invoicePreview.loadError"),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [invoiceId, t]);

  // Effect separato, agganciato a pdfUrl (non a invoiceId): revoca l'URL
  // creato sopra sia allo smontaggio sia se mai venisse rimpiazzato,
  // evitando di far vivere il blob in memoria oltre la vita di questo
  // componente (vedi il contratto in invoiceService.getInvoicePdfBlobUrl).
  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  return (
    <ModalBaseComponent
      isOpen
      onClose={onClose}
      title={t("components.invoicePreview.title")}
      size="wide"
      primaryAction={
        <ButtonComponent type="button" onClick={onClose}>
          {t("components.invoicePreview.close")}
        </ButtonComponent>
      }
    >
      <div className={styles.previewArea}>
        {loadError ? (
          <p role="alert" className={styles.errorBanner}>
            {loadError}
          </p>
        ) : isLoading ? (
          <p role="status" className={styles.statusText}>
            {t("components.invoicePreview.loading")}
          </p>
        ) : (
          pdfUrl && (
            <iframe
              className={styles.pdfFrame}
              src={pdfUrl}
              title={t("components.invoicePreview.frameTitle")}
            />
          )
        )}
      </div>
    </ModalBaseComponent>
  );
}

export default InvoicePreviewComponent;
