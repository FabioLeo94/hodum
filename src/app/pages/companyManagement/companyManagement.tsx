import { Fragment, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Building2, DatabaseBackup, Download, FileText, TriangleAlert, Users } from "lucide-react";
import TopbarComponent from "../../components/topbar/topbarComponent";
import ManagementCardComponent from "../../components/managementCard/managementCardComponent";
import BackupSettingsDrawerComponent from "../../components/backupSettingsDrawer/backupSettingsDrawerComponent";
import EditCompanyDrawerComponent from "../../components/editCompanyDrawer/editCompanyDrawerComponent";
import CustomersDrawerComponent from "../../components/customersDrawer/customersDrawerComponent";
import DeleteCompanyModalComponent from "../../components/deleteCompanyModal/deleteCompanyModalComponent";
import { getUser, isAuthenticated, logout, useAuthUser } from "../../services/auth/authService";
import {
  deleteCompany,
  exportCompanyData,
  getCompanyName,
} from "../../services/company/companyService";
import { downloadJsonFile } from "../../../shared/utils/downloadJsonFile";
import { usePageMeta } from "../../../shared/hooks/usePageMeta";
import styles from "./companyManagement.module.css";

// Pannello riservato al solo owner (a differenza di employees.tsx, che
// ammette anche il project manager): la revoca dell'accesso VPN, i backup e
// le altre voci future di questa pagina toccano l'infrastruttura
// dell'azienda, non la gestione operativa dei progetti/dipendenti che il
// manager già presidia altrove. Stesso pattern di guardia di
// changePassword.tsx/employees.tsx: nessuna rotta protetta filtra già per
// ruolo, quindi il controllo vive qui e reindirizza chi non è owner.
function CompanyManagement() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  usePageMeta({ title: t("pages.companyManagement.meta.title"), robots: "noindex, nofollow" });

  const [isBackupDrawerOpen, setIsBackupDrawerOpen] = useState(false);
  const [isEditCompanyDrawerOpen, setIsEditCompanyDrawerOpen] = useState(false);
  const [isCustomersDrawerOpen, setIsCustomersDrawerOpen] = useState(false);
  const [exportError, setExportError] = useState("");
  const [isDeleteCompanyModalOpen, setIsDeleteCompanyModalOpen] = useState(false);
  const [deleteCompanyError, setDeleteCompanyError] = useState("");
  // undefined finché non risolto: la card "Elimina azienda" resta cliccabile
  // comunque, ma la modale di conferma (che confronta il testo digitato con
  // questo nome) non va montata finché non lo conosciamo davvero, stesso
  // motivo di companyName in topbarComponent.
  const [companyName, setCompanyName] = useState<string | undefined>(undefined);

  // Solo il redirect qui dentro: niente setState nell'effect (stesso motivo
  // già commentato in topbarComponent.tsx per isLoadingProjects, evita
  // render a cascata). companyId è derivato sotto da useAuthUser, che
  // ri-renderizza la pagina da sé se mai cambiasse.
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

  // Serve solo alla modale di cancellazione (l'owner deve ridigitare questo
  // nome per confermare): stesso identico pattern di getCompanyName in
  // topbarComponent, qui però a livello di pagina invece che di ogni
  // pagina montante la topbar.
  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    getCompanyName(companyId)
      .then((name) => {
        if (!cancelled) setCompanyName(name);
      })
      .catch(() => {
        if (!cancelled) setCompanyName(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  function handleLogout() {
    logout();
    navigate("/auth");
  }

  async function handleExportCompany() {
    if (!companyId) return;
    setExportError("");
    try {
      const data = await exportCompanyData(companyId);
      downloadJsonFile(data, "hodum-export-azienda.json");
    } catch (error) {
      setExportError(
        error instanceof Error ? error.message : t("pages.companyManagement.exportError"),
      );
    }
  }

  function closeDeleteCompanyModal() {
    setDeleteCompanyError("");
    setIsDeleteCompanyModalOpen(false);
  }

  // DELETE /companies/{id} elimina anche l'owner stesso (vedi
  // companyService.ts): la sessione corrente non è più valida dopo il
  // successo, stesso logout+redirect già usato dal resto della pagina.
  async function handleConfirmDeleteCompany() {
    if (!companyId) return;
    try {
      await deleteCompany(companyId);
      handleLogout();
    } catch (error) {
      setDeleteCompanyError(
        error instanceof Error ? error.message : t("pages.companyManagement.deleteError"),
      );
    }
  }

  return (
    <Fragment>
      <TopbarComponent onLogout={handleLogout} />
      <div className={styles.container}>
        <header className={styles.header}>
          <h1 className={styles.title}>{t("pages.companyManagement.title")}</h1>
          <p className={styles.subtitle}>{t("pages.companyManagement.subtitle")}</p>
        </header>

        {companyId && (
          <div className={styles.cardsGrid}>
            <ManagementCardComponent
              icon={<Building2 size={26} strokeWidth={2} aria-hidden="true" />}
              title={t("pages.companyManagement.cards.editCompany.title")}
              description={t("pages.companyManagement.cards.editCompany.description")}
              onClick={() => setIsEditCompanyDrawerOpen(true)}
            />
            <ManagementCardComponent
              icon={<Users size={26} strokeWidth={2} aria-hidden="true" />}
              title={t("pages.companyManagement.cards.customers.title")}
              description={t("pages.companyManagement.cards.customers.description")}
              onClick={() => setIsCustomersDrawerOpen(true)}
            />
            <ManagementCardComponent
              icon={<FileText size={26} strokeWidth={2} aria-hidden="true" />}
              title={t("pages.companyManagement.cards.invoices.title")}
              description={t("pages.companyManagement.cards.invoices.description")}
              onClick={() => navigate("/invoices")}
            />
            <ManagementCardComponent
              icon={<DatabaseBackup size={26} strokeWidth={2} aria-hidden="true" />}
              title={t("pages.companyManagement.cards.backup.title")}
              description={t("pages.companyManagement.cards.backup.description")}
              onClick={() => setIsBackupDrawerOpen(true)}
            />
            <ManagementCardComponent
              icon={<Download size={26} strokeWidth={2} aria-hidden="true" />}
              title={t("pages.companyManagement.cards.exportCompany.title")}
              description={t("pages.companyManagement.cards.exportCompany.description")}
              onClick={handleExportCompany}
            />
          </div>
        )}

        {exportError && (
          <p role="alert" className={styles.errorBanner}>
            {exportError}
          </p>
        )}

        {/* Separata visivamente dalla griglia sopra (non un'altra card nella
            stessa riga): un'azione irreversibile su tutta l'azienda merita un
            proprio spazio, non la stessa disinvoltura di aprire un drawer. */}
        {companyId && (
          <div className={styles.dangerZone}>
            <h2 className={styles.dangerZoneTitle}>
              {t("pages.companyManagement.dangerZone.title")}
            </h2>
            <ManagementCardComponent
              icon={<TriangleAlert size={26} strokeWidth={2} aria-hidden="true" />}
              title={t("pages.companyManagement.cards.deleteCompany.title")}
              description={t("pages.companyManagement.cards.deleteCompany.description")}
              variant="danger"
              onClick={() => setIsDeleteCompanyModalOpen(true)}
            />
          </div>
        )}
      </div>

      {companyId && (
        <EditCompanyDrawerComponent
          isOpen={isEditCompanyDrawerOpen}
          onClose={() => setIsEditCompanyDrawerOpen(false)}
          companyId={companyId}
        />
      )}
      {companyId && (
        <CustomersDrawerComponent
          isOpen={isCustomersDrawerOpen}
          onClose={() => setIsCustomersDrawerOpen(false)}
          companyId={companyId}
        />
      )}
      {companyId && (
        <BackupSettingsDrawerComponent
          isOpen={isBackupDrawerOpen}
          onClose={() => setIsBackupDrawerOpen(false)}
          companyId={companyId}
        />
      )}
      {companyId && companyName !== undefined && (
        <DeleteCompanyModalComponent
          isOpen={isDeleteCompanyModalOpen}
          onClose={closeDeleteCompanyModal}
          companyName={companyName}
          onConfirm={handleConfirmDeleteCompany}
          submitError={deleteCompanyError}
        />
      )}
    </Fragment>
  );
}

export default CompanyManagement;
