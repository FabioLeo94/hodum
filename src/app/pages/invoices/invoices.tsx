import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Plus } from "lucide-react";
import TopbarComponent from "../../components/topbar/topbarComponent";
import GenerateInvoiceDrawerComponent from "../../components/generateInvoiceDrawer/generateInvoiceDrawerComponent";
import InvoicePreviewComponent from "../../components/invoicePreview/invoicePreviewComponent";
import MessageCardComponent from "../../components/messageCard/messageCardComponent";
import { listCompanyInvoices } from "../../services/invoice/invoiceService";
import { listCustomerSummaries } from "../../services/customer/customerService";
import type { CustomerSummary } from "../../services/customer/customerService";
import type { Invoice } from "../../../shared/types/invoice";
import { getUser, isAuthenticated, logout, useAuthUser } from "../../services/auth/authService";
import { formatDate, resolveDateLocale } from "../../../shared/utils/formatDate";
import { formatElapsedDuration } from "../../../shared/utils/formatElapsedDuration";
import { usePageMeta } from "../../../shared/hooks/usePageMeta";
import styles from "./invoices.module.css";

// Nessuna libreria di formattazione valuta nel progetto (rateConversion.ts
// tratta solo l'orario canonico €/ora): un Intl.NumberFormat locale basta,
// EUR è l'unica valuta gestita (vedi il commento su tariffaOraria in
// shared/types/customer.ts).
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat(resolveDateLocale(), { style: "currency", currency: "EUR" }).format(
    amount,
  );
}

// Pannello riservato al solo owner (stessa guardia di companyManagement.tsx):
// generare pre-fatture tocca dati contabili dell'azienda, non la gestione
// operativa che il project manager presidia altrove. Nessuna rotta protetta
// filtra già per ruolo, quindi il controllo vive qui e reindirizza chi non è
// owner.
function Invoices() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  usePageMeta({ title: t("pages.invoices.meta.title"), robots: "noindex, nofollow" });

  useEffect(() => {
    if (!isAuthenticated()) {
      navigate("/auth", { replace: true });
      return;
    }
    if (getUser()?.role !== "owner") {
      navigate("/dashboard", { replace: true });
    }
  }, [navigate]);

  const companyId = useAuthUser()?.companyId ?? null;

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  // Sola convenienza per etichettare le righe con un nome invece di un id
  // (vedi listCustomerSummaries in customerService.ts, già usata altrove per
  // la stessa risoluzione id -> nome): un fallimento qui non impedisce di
  // vedere le fatture, la colonna cliente degrada mostrando l'id.
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // ?invoiceId=... apre direttamente l'anteprima di quella fattura: usato dal
  // bottone "Visualizza fattura" di un task lockato (taskFormModalComponent/
  // taskDetailModalComponent), stesso pattern di ?openTask in taskList.tsx.
  const [searchParams, setSearchParams] = useSearchParams();
  const previewInvoiceId = searchParams.get("invoiceId");

  const loadInvoices = useCallback(() => {
    if (!companyId) return;
    listCompanyInvoices(companyId)
      .then((data) => {
        setInvoices(data);
        setLoadError("");
      })
      .catch((error: unknown) => {
        setLoadError(error instanceof Error ? error.message : t("pages.invoices.loadError"));
      })
      .finally(() => setIsLoading(false));
  }, [companyId, t]);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  useEffect(() => {
    listCustomerSummaries()
      .then(setCustomers)
      .catch(() => {
        // Vedi il commento su `customers` sopra: nessun banner d'errore
        // dedicato per un dato di sola convenienza.
      });
  }, []);

  // Memoizzata sui soli `customers`: senza, verrebbe ricostruita ad ogni
  // render (anche solo per l'apertura/chiusura dell'anteprima via
  // searchParams, che non tocca `customers`), un lavoro O(n) inutile per una
  // mappa che cambia solo quando la lista clienti viene ricaricata.
  const customerNameById = useMemo(
    () => new Map(customers.map((customer) => [customer.id, customer.name])),
    [customers],
  );

  function handleLogout() {
    logout();
    navigate("/auth");
  }

  function openPreview(invoiceId: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("invoiceId", invoiceId);
      return next;
    });
  }

  function closePreview() {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("invoiceId");
        return next;
      },
      { replace: true },
    );
  }

  function handleGenerated() {
    loadInvoices();
  }

  return (
    <Fragment>
      <TopbarComponent onLogout={handleLogout} />
      <div className={styles.container}>
        <header className={styles.header}>
          <div className={styles.titleGroup}>
            <button
              type="button"
              className={styles.backButton}
              aria-label={t("pages.invoices.backLabel")}
              onClick={() => navigate("/company-management")}
            >
              <ArrowLeft size={18} aria-hidden="true" />
            </button>
            <h1 className={styles.title}>{t("pages.invoices.title")}</h1>
          </div>
          <button
            type="button"
            className={styles.generateButton}
            onClick={() => setIsDrawerOpen(true)}
          >
            <Plus size={16} aria-hidden="true" />
            {t("pages.invoices.generateButton")}
          </button>
        </header>

        {loadError ? (
          <MessageCardComponent
            variant="error"
            role="alert"
            title={t("pages.invoices.loadErrorTitle")}
            text={loadError}
          />
        ) : isLoading ? (
          <p role="status" className={styles.statusText}>
            {t("pages.invoices.loading")}
          </p>
        ) : invoices.length === 0 ? (
          <MessageCardComponent
            title={t("pages.invoices.emptyTitle")}
            text={t("pages.invoices.emptyText")}
          />
        ) : (
          <div className={styles.tableCard}>
            <table className={styles.invoiceTable}>
              <caption className={styles.srOnly}>{t("pages.invoices.tableCaption")}</caption>
              <thead>
                <tr>
                  <th scope="col">{t("pages.invoices.columnNumber")}</th>
                  <th scope="col">{t("pages.invoices.columnDate")}</th>
                  <th scope="col">{t("pages.invoices.columnCustomer")}</th>
                  <th scope="col">{t("pages.invoices.columnHours")}</th>
                  <th scope="col">{t("pages.invoices.columnAmount")}</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className={styles.invoiceRow}>
                    <td>
                      <button
                        type="button"
                        className={styles.invoiceNumberButton}
                        onClick={() => openPreview(invoice.id)}
                      >
                        {t("pages.invoices.numberPrefix", { number: invoice.numero })}
                      </button>
                    </td>
                    <td>{formatDate(invoice.dataGenerazione)}</td>
                    <td>{customerNameById.get(invoice.customerId) ?? invoice.customerId}</td>
                    <td>{formatElapsedDuration(invoice.totaleSecondi)}</td>
                    <td>{formatCurrency(invoice.totaleImporto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <GenerateInvoiceDrawerComponent
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onGenerated={handleGenerated}
      />

      {previewInvoiceId && (
        <InvoicePreviewComponent
          key={previewInvoiceId}
          invoiceId={previewInvoiceId}
          onClose={closePreview}
        />
      )}
    </Fragment>
  );
}

export default Invoices;
