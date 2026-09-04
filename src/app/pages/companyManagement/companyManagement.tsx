import { Fragment, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Building2, DatabaseBackup } from "lucide-react";
import TopbarComponent from "../../components/topbar/topbarComponent";
import ManagementCardComponent from "../../components/managementCard/managementCardComponent";
import BackupSettingsDrawerComponent from "../../components/backupSettingsDrawer/backupSettingsDrawerComponent";
import EditCompanyDrawerComponent from "../../components/editCompanyDrawer/editCompanyDrawerComponent";
import { getUser, isAuthenticated, logout, useAuthUser } from "../../services/auth/authService";
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
  usePageMeta({ title: "Gestione aziendale", robots: "noindex, nofollow" });

  const [isBackupDrawerOpen, setIsBackupDrawerOpen] = useState(false);
  const [isEditCompanyDrawerOpen, setIsEditCompanyDrawerOpen] = useState(false);

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

  function handleLogout() {
    logout();
    navigate("/auth");
  }

  return (
    <Fragment>
      <TopbarComponent onLogout={handleLogout} />
      <div className={styles.container}>
        <header className={styles.header}>
          <h1 className={styles.title}>Gestione aziendale</h1>
          <p className={styles.subtitle}>Strumenti riservati al titolare dell'azienda.</p>
        </header>

        {companyId && (
          <div className={styles.cardsGrid}>
            <ManagementCardComponent
              icon={<Building2 size={26} strokeWidth={2} aria-hidden="true" />}
              title="Modifica dati aziendali"
              description="Nome, ragione sociale, P.IVA, codice fiscale, indirizzo e PEC della tua azienda."
              onClick={() => setIsEditCompanyDrawerOpen(true)}
            />
            <ManagementCardComponent
              icon={<DatabaseBackup size={26} strokeWidth={2} aria-hidden="true" />}
              title="Backup"
              description="Gestisci i backup del database della tua azienda: frequenza, quanti conservarne e come nominarli."
              onClick={() => setIsBackupDrawerOpen(true)}
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
        <BackupSettingsDrawerComponent
          isOpen={isBackupDrawerOpen}
          onClose={() => setIsBackupDrawerOpen(false)}
          companyId={companyId}
        />
      )}
    </Fragment>
  );
}

export default CompanyManagement;
