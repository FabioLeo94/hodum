import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { updateStoredUser, useAuthUser } from "../../services/auth/authService";
import { useCompanyName } from "../../services/company/companyService";
import { getProjectName, listProjectsSummary } from "../../services/project/projectService";
import type { ProjectSummary } from "../../services/project/projectService";
import { deleteEmployee, exportUserData, updateEmployee } from "../../services/user/userService";
import { notifySuccess } from "../../services/notify/notifyService";
import AvatarComponent from "../avatar/avatarComponent";
import EditAccountModalComponent from "../editAccountModal/editAccountModalComponent";
import DeleteEmployeeModalComponent from "../deleteEmployeeModal/deleteEmployeeModalComponent";
import NotificationBellComponent from "../notificationBell/notificationBellComponent";
import LanguageSwitcherComponent from "../languageSwitcher/languageSwitcherComponent";
import type { EditAccountFormValues } from "../editAccountModal/editAccountModalComponent";
import { formatDateTime } from "../../../shared/utils/formatDate";
import { downloadJsonFile } from "../../../shared/utils/downloadJsonFile";
import { getDisplayName } from "../../../shared/utils/displayName";
import styles from "./topbarComponent.module.css";

interface Prop {
  onLogout: () => void;
}

interface NavItem {
  to: string;
  label: string;
}

// Stesso pattern di derivePageContext in assistantDrawerComponent: è l'unica
// rotta che rappresenta un progetto aperto, e serve qui per evidenziare
// "Progetti" come attivo e per risolvere il nome da mostrare al suo fianco.
const TASK_LIST_PATH_PATTERN = /^\/dashboard\/([^/]+)\/task-list\/?$/;

function TopbarComponent({ onLogout }: Prop) {
  // Letto direttamente da qui (invece che passato come prop) per non dover
  // propagare user/role in ogni pagina che monta TopbarComponent (dashboard,
  // taskList in 5 punti diversi): stesso storage già usato da
  // ProtectedRouteComponent per la stessa decisione. "Dipendenti" non è più
  // una voce di questa nav (spostata come card dentro "Gestione aziendale",
  // vedi companyManagement.tsx): il project manager vi accede da lì insieme
  // all'owner. useAuthUser (invece di getUser diretto) fa ri-renderizzare
  // questo componente quando arriva 'user:updated' (es. l'owner promuove
  // questo utente a manager mentre è già sulla pagina), senza dover
  // disconnettere e riconnettere.
  const { t } = useTranslation();
  const NAV_ITEMS: NavItem[] = [{ to: "/dashboard", label: t("components.topbar.nav.dashboard") }];
  const authUser = useAuthUser();
  const role = authUser?.role;
  const companyId = authUser?.companyId ?? undefined;
  // "Gestione aziendale" è ora aperta anche al project manager (non solo
  // all'owner): la pagina stessa nasconde a lui le card infrastrutturali
  // (backup, fatture, export, cancellazione azienda), vedi companyManagement.tsx.
  const canSeeCompanyManagement = role === "owner" || role === "manager";
  const isOwner = role === "owner";
  const { pathname } = useLocation();

  // Nessun placeholder mentre carica (a differenza di activeProjectLabel):
  // il nome azienda non cambia mai durante la sessione, quindi un vuoto
  // momentaneo alla prima renderizzazione è meno invasivo di un testo
  // segnaposto che lampeggia ad ogni mount della topbar. useCompanyName (non
  // più un fetch + state locale) si aggiorna anche dopo un rename fatto da
  // EditCompanyDrawerComponent, vedi companyService.ts.
  const companyName = useCompanyName(companyId);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const editAccountItemRef = useRef<HTMLButtonElement>(null);
  const logoutItemRef = useRef<HTMLButtonElement>(null);

  const [isEditAccountModalOpen, setIsEditAccountModalOpen] = useState(false);
  const [editAccountError, setEditAccountError] = useState("");
  const [exportAccountError, setExportAccountError] = useState("");

  const [isDeleteAccountModalOpen, setIsDeleteAccountModalOpen] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState("");

  const [isProjectsMenuOpen, setIsProjectsMenuOpen] = useState(false);
  // undefined = non ancora caricato: la fetch parte solo alla prima apertura
  // del menu, non al mount di ogni pagina (dashboard/dipendenti non lo usano mai).
  const [projects, setProjects] = useState<ProjectSummary[] | undefined>(undefined);
  const [projectsError, setProjectsError] = useState("");
  // Derivato invece che uno state a parte: evita un setState sincrono in
  // testa all'effect qui sotto (react-hooks/set-state-in-effect), il
  // risultato è comunque lo stesso "sto aspettando la prima risposta".
  const isLoadingProjects = isProjectsMenuOpen && projects === undefined && !projectsError;
  const projectsMenuId = useId();
  const projectsContainerRef = useRef<HTMLDivElement>(null);
  const projectsButtonRef = useRef<HTMLButtonElement>(null);
  const projectsPanelRef = useRef<HTMLDivElement>(null);
  const firstProjectItemRef = useRef<HTMLAnchorElement>(null);

  // Tenuto insieme all'id a cui si riferisce, stesso motivo di
  // assistantDrawerComponent: evita di mostrare per un attimo il nome del
  // progetto precedente quando si naviga da un progetto a un altro.
  const [resolvedProject, setResolvedProject] = useState<
    { id: string; name: string | undefined } | undefined
  >(undefined);
  const activeProjectId = pathname.match(TASK_LIST_PATH_PATTERN)?.[1];
  const activeProjectName =
    resolvedProject && resolvedProject.id === activeProjectId ? resolvedProject.name : undefined;
  const activeProjectLabel = activeProjectId
    ? activeProjectName ?? t("components.topbar.nav.projectFallback")
    : undefined;

  useEffect(() => {
    if (!activeProjectId) return;
    let cancelled = false;
    getProjectName(activeProjectId)
      .then((name) => {
        if (!cancelled) setResolvedProject({ id: activeProjectId, name });
      })
      .catch(() => {
        if (!cancelled) setResolvedProject({ id: activeProjectId, name: undefined });
      });
    return () => {
      cancelled = true;
    };
  }, [activeProjectId]);

  // Fetch pigra: solo la prima volta che il menu viene aperto, non ad ogni
  // toggle successivo (i progetti cambiano raramente, vedi subscribeToProjects
  // in dashboard.tsx per lo stesso presupposto).
  useEffect(() => {
    if (!isProjectsMenuOpen || projects !== undefined) return;
    let cancelled = false;
    listProjectsSummary()
      .then((data) => {
        if (!cancelled) setProjects(data);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setProjectsError(
            error instanceof Error ? error.message : t("components.topbar.projectsMenu.loadError"),
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isProjectsMenuOpen, projects, t]);

  useEffect(() => {
    if (!isMenuOpen) return;

    editAccountItemRef.current?.focus();

    function handlePointerDown(event: PointerEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
        accountButtonRef.current?.focus();
      }
    }

    // "Modifica account" + "Disconnetti" ora sono due voci (prima solo
    // Disconnetti, dove Tab chiudeva sempre il menu): un Tab in avanti
    // dall'ultima voce o indietro dalla prima deve ancora chiudere il menu,
    // ma un Tab tra le due voci deve muovere il focus normalmente.
    // focusout (bubbling, a differenza di blur) sul container intercetta
    // entrambi i casi confrontando dove il focus è appena arrivato.
    function handleFocusOut(event: FocusEvent) {
      const nextFocused = event.relatedTarget as Node | null;
      if (!containerRef.current?.contains(nextFocused)) {
        setIsMenuOpen(false);
      }
    }

    // Copiato in una variabile locale (non riletto in cleanup): al momento
    // dello smontaggio containerRef.current potrebbe già essere null, e
    // l'evento va rimosso dallo stesso nodo a cui è stato aggiunto.
    const container = containerRef.current;
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    container?.addEventListener("focusout", handleFocusOut);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      container?.removeEventListener("focusout", handleFocusOut);
    };
  }, [isMenuOpen]);

  // Stesso pattern del menu account (dismiss su click esterno/Escape). A
  // differenza di quello, qui gli item possono essere più di uno: niente
  // scorciatoia "Tab chiude", il focus attraversa i link normalmente. Il
  // pannello vive in un portal (vedi sotto il motivo), quindi il click
  // "dentro" va riconosciuto anche lì, non solo in projectsContainerRef.
  useEffect(() => {
    if (!isProjectsMenuOpen) return;

    firstProjectItemRef.current?.focus();

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (
        projectsContainerRef.current?.contains(target) ||
        projectsPanelRef.current?.contains(target)
      ) {
        return;
      }
      setIsProjectsMenuOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsProjectsMenuOpen(false);
        projectsButtonRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isProjectsMenuOpen]);

  // Il pannello è in portal su document.body (non dentro .nav): .nav ha
  // overflow-x: auto per restare scrollabile su viewport stretti (vedi sotto),
  // e per una regola CSS nota il browser forza anche overflow-y ad "auto" non
  // appena overflow-x non è "visible" - qualunque discendente assoluto che
  // sporge sotto .nav verrebbe quindi tagliato. Posizione in px calcolata dal
  // bottone: la topbar è sticky top:0, quindi non serve inseguire lo scroll
  // della pagina, solo un eventuale resize della finestra.
  useLayoutEffect(() => {
    if (!isProjectsMenuOpen) return;

    function reposition() {
      const button = projectsButtonRef.current;
      const panel = projectsPanelRef.current;
      if (!button || !panel) return;
      const rect = button.getBoundingClientRect();
      panel.style.top = `${rect.bottom + 8}px`;
      panel.style.left = `${rect.left}px`;
    }

    reposition();
    window.addEventListener("resize", reposition);
    return () => window.removeEventListener("resize", reposition);
  }, [isProjectsMenuOpen]);

  function handleLogoutClick() {
    setIsMenuOpen(false);
    onLogout();
  }

  function handleEditAccountClick() {
    setIsMenuOpen(false);
    setEditAccountError("");
    setExportAccountError("");
    setIsEditAccountModalOpen(true);
  }

  function closeEditAccountModal() {
    setEditAccountError("");
    setExportAccountError("");
    setIsEditAccountModalOpen(false);
  }

  // GET /users/{id}/export self-service (vedi userService.ts): eventuali
  // errori restano qui (exportAccountError), la modale non lancia mai — il
  // suo unico compito è disabilitare il bottone durante il download.
  async function handleExportAccount() {
    if (!authUser) return;
    try {
      const data = await exportUserData(authUser.id);
      downloadJsonFile(data, "hodum-export-utente.json");
      notifySuccess(t("components.topbar.account.exportSuccess"));
    } catch (error) {
      setExportAccountError(
        error instanceof Error ? error.message : t("components.topbar.account.exportError"),
      );
    }
  }

  // Apre la conferma di cancellazione al posto della modale di modifica
  // account, stesso "conferma poi chiama" già usato da employees.tsx: le due
  // modali non stanno mai aperte insieme.
  function handleRequestDeleteAccount() {
    setIsEditAccountModalOpen(false);
    setDeleteAccountError("");
    setIsDeleteAccountModalOpen(true);
  }

  function closeDeleteAccountModal() {
    setDeleteAccountError("");
    setIsDeleteAccountModalOpen(false);
  }

  // DELETE /users/{id} instrada già il self-service (vedi deleteEmployee in
  // userService.ts): dopo il successo l'utente non esiste più, stesso
  // logout+redirect già usato dal resto della topbar (onLogout è la stessa
  // funzione che le pagine passano al bottone "Disconnetti").
  async function handleConfirmDeleteAccount() {
    if (!authUser) return;
    try {
      await deleteEmployee(authUser.id);
      notifySuccess(t("components.topbar.account.deleteAccountSuccess"));
      onLogout();
    } catch (error) {
      setDeleteAccountError(
        error instanceof Error ? error.message : t("components.topbar.account.deleteAccountError"),
      );
    }
  }

  // PUT /users/{id} instrada già il self-service quando id === requester.id
  // (vedi updateUser lato backend): stessa updateEmployee usata dall'owner su
  // un dipendente, qui chiamata sul proprio id. updateStoredUser propaga
  // subito username/email aggiornati al resto dell'app (es. questa stessa
  // topbar), stesso pattern di changePasswordFormComponent.
  async function handleSaveAccount(values: EditAccountFormValues) {
    if (!authUser) return;
    try {
      const updated = await updateEmployee(authUser.id, values);
      updateStoredUser(updated);
      notifySuccess(t("components.topbar.account.updateSuccess"));
      closeEditAccountModal();
    } catch (error) {
      setEditAccountError(
        error instanceof Error ? error.message : t("components.topbar.account.updateError"),
      );
    }
  }

  function handleProjectLinkClick() {
    setIsProjectsMenuOpen(false);
  }

  // Dashboard e Gestione aziendale condividono lo stesso span/link attivo,
  // pur vivendo in due gruppi separati della topbar (nav primaria a sinistra,
  // Gestione aziendale accanto all'account a destra): la funzione resta unica
  // per coerenza di stato/stile, non per contiguità nel markup.
  // Calcolato una sola volta per render (invece che ad ogni punto in cui
  // serve, sotto): getDisplayName è pura ma non c'è motivo di richiamarla tre
  // volte sullo stesso authUser nello stesso render.
  const authUserDisplayName = authUser ? getDisplayName(authUser) : "";

  function renderNavItem(item: NavItem) {
    return pathname === item.to ? (
      <span key={item.to} className={styles.navItemActive} aria-current="page">
        {item.label}
      </span>
    ) : (
      <Link key={item.to} className={styles.navItem} to={item.to}>
        {item.label}
      </Link>
    );
  }

  return (
    <header className={styles.topbar}>
      <div className={styles.leftGroup}>
        <span className={styles.logo}>
          <span className={styles.logoMark}>H</span>odum
        </span>

        <nav className={styles.nav} aria-label={t("components.topbar.nav.main")}>
          {NAV_ITEMS.map(renderNavItem)}

          <div className={styles.projectsMenuArea} ref={projectsContainerRef}>
            <button
              ref={projectsButtonRef}
              type="button"
              className={styles.navItem}
              data-active={Boolean(activeProjectId)}
              aria-haspopup="menu"
              aria-expanded={isProjectsMenuOpen}
              aria-controls={projectsMenuId}
              onClick={() => setIsProjectsMenuOpen((current) => !current)}
            >
              {t("components.topbar.nav.projects")}
              {/* Nome del progetto aperto integrato nel bottone (al posto del
                  tag ambra indipendente di prima): un solo elemento
                  interattivo invece di due, il peso tipografico maggiore
                  distingue il nome dal resto anche senza percepire il colore. */}
              {activeProjectLabel && (
                <span className={styles.projectsButtonProjectName}>
                  {" — "}
                  {activeProjectLabel}
                </span>
              )}
              <ChevronDown
                className={styles.chevronIcon}
                data-open={isProjectsMenuOpen}
                size={14}
                strokeWidth={2.5}
                aria-hidden="true"
              />
            </button>

            {isProjectsMenuOpen &&
              createPortal(
                <div
                  ref={projectsPanelRef}
                  id={projectsMenuId}
                  role="menu"
                  aria-label={t("components.topbar.nav.projects")}
                  className={styles.projectsMenu}
                >
                  {isLoadingProjects ? (
                    <p className={styles.projectsMenuStatus}>
                      {t("components.topbar.projectsMenu.loading")}
                    </p>
                  ) : projectsError ? (
                    <p className={styles.projectsMenuStatus} role="alert">
                      {projectsError}
                    </p>
                  ) : projects && projects.length === 0 ? (
                    <p className={styles.projectsMenuStatus}>
                      {t("components.topbar.projectsMenu.empty")}
                    </p>
                  ) : (
                    projects?.map((project, index) => (
                      <Link
                        key={project.id}
                        ref={index === 0 ? firstProjectItemRef : undefined}
                        role="menuitem"
                        className={styles.projectsMenuItem}
                        to={`/dashboard/${project.id}/task-list`}
                        aria-current={project.id === activeProjectId ? "true" : undefined}
                        title={project.name}
                        onClick={handleProjectLinkClick}
                      >
                        {project.name}
                      </Link>
                    ))
                  )}
                </div>,
                document.body,
              )}
          </div>
        </nav>
      </div>

      {/* Assoluto rispetto a .topbar (sticky = positioned) invece che una
          terza colonna in un layout a grid: leftGroup e rightGroup restano
          due blocchi di larghezza diversa (nav pesante vs. sola icona
          account), un centro "vero" indipendente da quell'asimmetria si
          ottiene solo sganciandolo dal flusso. */}
      {companyName && (
        <span className={styles.companyName} title={companyName}>
          {companyName}
        </span>
      )}

      <div className={styles.rightGroup}>
        {/* Aperta anche al project manager (non più owner-only): "Dipendenti"
            vive ora come card dentro questa pagina insieme a backup, fatture
            ed export, che restano invece visibili alla sola card owner-only
            di companyManagement.tsx. */}
        {canSeeCompanyManagement && (
          <>
            {renderNavItem({
              to: "/company-management",
              label: t("components.topbar.nav.companyManagement"),
            })}
            <span className={styles.separator} aria-hidden="true" />
          </>
        )}

        {/* Visibile a tutti i ruoli, quindi fuori dal blocco sopra. */}
        <LanguageSwitcherComponent />
        <NotificationBellComponent />

        <div className={styles.accountArea} ref={containerRef}>
          <button
            ref={accountButtonRef}
            type="button"
            className={styles.accountButton}
            aria-label={t("components.topbar.account.menuLabel")}
            aria-haspopup="menu"
            aria-expanded={isMenuOpen}
            aria-controls={menuId}
            onClick={() => setIsMenuOpen((current) => !current)}
          >
            <AvatarComponent displayName={authUserDisplayName} size="md" />
          </button>

          {isMenuOpen && (
            <div id={menuId} role="menu" className={styles.menu}>
              {/* Intestazione informativa (non un menuitem: niente ruolo/focus,
                  stesso trattamento di .menuLastLogin sotto) cosi chi apre il
                  menu conferma subito "chi" e' loggato prima di agire. */}
              {authUser && (
                <>
                  <div className={styles.menuUserInfo}>
                    <p className={styles.menuUserName} title={authUserDisplayName}>
                      {authUserDisplayName}
                    </p>
                    <p className={styles.menuUserEmail} title={authUser.email}>
                      {authUser.email}
                    </p>
                  </div>
                  <div className={styles.menuSeparator} role="separator" />
                </>
              )}
              <button
                ref={editAccountItemRef}
                type="button"
                role="menuitem"
                className={styles.menuItem}
                onClick={handleEditAccountClick}
              >
                {t("components.topbar.account.editAccount")}
              </button>
              <button
                ref={logoutItemRef}
                type="button"
                role="menuitem"
                className={styles.menuItem}
                onClick={handleLogoutClick}
              >
                {t("components.topbar.account.logout")}
              </button>
              {/* Non più legato al ruolo (a differenza della vecchia posizione
                  nella topbar, riservata all'employee per mancanza di spazio
                  accanto a "Dipendenti"): qui c'è spazio per chiunque abbia
                  già effettuato un accesso precedente. role="separator" (non
                  solo uno span decorativo) perché AT dentro un role="menu" si
                  aspettano voci tipizzate, non testo libero non annunciato. */}
              {authUser?.lastLoginAt && (
                <>
                  <div className={styles.menuSeparator} role="separator" />
                  <p className={styles.menuLastLogin}>
                    {t("components.topbar.account.lastLogin", {
                      date: formatDateTime(authUser.lastLoginAt),
                    })}
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Smontata (non solo isOpen=false) quando si chiude, stesso pattern di
          editingEmployee in employees.tsx: senza il remount via `key` la
          prossima apertura ripartirebbe dallo state interno resettato sui
          valori pre-salvataggio (le closure di resetForm catturano le props
          del render in cui la modale è stata aperta), non da quelli appena
          salvati con updateStoredUser. */}
      {isEditAccountModalOpen && authUser && (
        <EditAccountModalComponent
          key={authUser.id}
          isOpen={isEditAccountModalOpen}
          onClose={closeEditAccountModal}
          currentUsername={authUser.username}
          currentFirstName={authUser.firstName}
          currentLastName={authUser.lastName}
          currentPronoun={authUser.pronoun}
          currentEmail={authUser.email}
          currentCreatedAt={authUser.createdAt}
          isOwner={isOwner}
          onSave={handleSaveAccount}
          onExport={handleExportAccount}
          onRequestDelete={handleRequestDeleteAccount}
          submitError={editAccountError}
          exportError={exportAccountError}
        />
      )}

      {isDeleteAccountModalOpen && authUser && (
        <DeleteEmployeeModalComponent
          key={authUser.id}
          isOpen={isDeleteAccountModalOpen}
          onClose={closeDeleteAccountModal}
          employeeDisplayName={authUserDisplayName}
          onConfirm={handleConfirmDeleteAccount}
          submitError={deleteAccountError}
          variant="self"
        />
      )}
    </header>
  );
}

export default TopbarComponent;
