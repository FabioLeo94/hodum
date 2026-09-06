import { Fragment, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Building2, DatabaseBackup, Download, FileText, TriangleAlert, UserRoundCog, Users } from "lucide-react";
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
  useCompanyName,
} from "../../services/company/companyService";
import { notifySuccess } from "../../services/notify/notifyService";
import { downloadJsonFile } from "../../../shared/utils/downloadJsonFile";
import { usePageMeta } from "../../../shared/hooks/usePageMeta";
import styles from "./companyManagement.module.css";

// Pannello aperto a owner e project manager (a differenza di prima, quando
// era owner-only): "Dipendenti" ora vive qui come card (spostata dalla
// topbar, che aveva un link separato per lo stesso pubblico, vedi
// topbarComponent.tsx), e il manager già presidia quella gestione operativa
// altrove (assegnazione progetti in employees.tsx). Le altre card restano
// owner-only più sotto (isOwner): toccano l'infrastruttura/i dati
// dell'azienda (backup, fatture, export, cancellazione), non la gestione
// operativa dei dipendenti. Stesso pattern di guardia di
// changePassword.tsx/employees.tsx: nessuna rotta protetta filtra già per
// ruolo, quindi il controllo vive qui e reindirizza chi non è autorizzato.
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
  // Solo il redirect qui dentro: niente setState nell'effect (stesso motivo
  // già commentato in topbarComponent.tsx per isLoadingProjects, evita
  // render a cascata). companyId è derivato sotto da useAuthUser, che
  // ri-renderizza la pagina da sé se mai cambiasse.
  useEffect(() => {
    if (!isAuthenticated()) {
      navigate("/auth", { replace: true });
      return;
    }
    const role = getUser()?.role;
    if (role !== "owner" && role !== "manager") {
      navigate("/dashboard", { replace: true });
    }
  }, [navigate]);

  // useAuthUser (invece di getUser diretto) fa ri-renderizzare la pagina
  // quando arriva 'user:updated', stesso motivo di employees.tsx: una
  // promozione a manager sblocca subito questa pagina senza dover
  // disconnettere e riconnettere.
  const authUser = useAuthUser();
  const isOwner = authUser?.role === "owner";
  const companyId = authUser?.companyId ?? null;

  // Serve solo alla modale di cancellazione (l'owner deve ridigitare questo
  // nome per confermare): useCompanyName (cache condivisa, vedi
  // companyService.ts) tiene questo valore aggiornato anche dopo un rename
  // fatto da EditCompanyDrawerComponent, cosa che un fetch-una-volta-sola
  // legato a companyId non poteva fare.
  const companyName = useCompanyName(companyId ?? undefined);

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
      notifySuccess(t("pages.companyManagement.exportSuccess"));
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
      notifySuccess(t("pages.companyManagement.deleteSuccess"));
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
              icon={<UserRoundCog size={26} strokeWidth={2} aria-hidden="true" />}
              title={t("pages.companyManagement.cards.employees.title")}
              description={t("pages.companyManagement.cards.employees.description")}
              onClick={() => navigate("/employees")}
            />
            {/* Le card sotto toccano l'infrastruttura/i dati dell'azienda
                (identità legale, fatturazione, backup, export, cancellazione):
                restano owner-only, a differenza di "Dipendenti" sopra. */}
            {isOwner && (
              <>
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
              </>
            )}
          </div>
        )}

        {exportError && (
          <p role="alert" className={styles.errorBanner}>
            {exportError}
          </p>
        )}

        {/* Separata visivamente dalla griglia sopra (non un'altra card nella
            stessa riga): un'azione irreversibile su tutta l'azienda merita un
            proprio spazio, non la stessa disinvoltura di aprire un drawer.
            Owner-only come le altre card infrastrutturali sopra. */}
        {companyId && isOwner && (
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

      {companyId && isOwner && (
        <EditCompanyDrawerComponent
          isOpen={isEditCompanyDrawerOpen}
          onClose={() => setIsEditCompanyDrawerOpen(false)}
          companyId={companyId}
        />
      )}
      {companyId && isOwner && (
        <CustomersDrawerComponent
          isOpen={isCustomersDrawerOpen}
          onClose={() => setIsCustomersDrawerOpen(false)}
          companyId={companyId}
        />
      )}
      {companyId && isOwner && (
        <BackupSettingsDrawerComponent
          isOpen={isBackupDrawerOpen}
          onClose={() => setIsBackupDrawerOpen(false)}
          companyId={companyId}
        />
      )}
      {companyId && isOwner && companyName !== undefined && (
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
