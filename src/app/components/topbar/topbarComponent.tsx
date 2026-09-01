import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router";
import { useAuthUser } from "../../services/auth/authService";
import { getProjectName, listProjectsSummary } from "../../services/project/projectService";
import type { ProjectSummary } from "../../services/project/projectService";
import styles from "./topbarComponent.module.css";

interface Prop {
  onLogout: () => void;
}

interface NavItem {
  to: string;
  label: string;
}

const NAV_ITEMS: NavItem[] = [{ to: "/dashboard", label: "Dashboard" }];

// Stesso pattern di derivePageContext in assistantDrawerComponent: è l'unica
// rotta che rappresenta un progetto aperto, e serve qui per evidenziare
// "Progetti" come attivo e per risolvere il nome da mostrare al suo fianco.
const TASK_LIST_PATH_PATTERN = /^\/dashboard\/([^/]+)\/task-list\/?$/;

function TopbarComponent({ onLogout }: Prop) {
  // Letto direttamente da qui (invece che passato come prop) per non dover
  // propagare user/role in ogni pagina che monta TopbarComponent (dashboard,
  // taskList in 5 punti diversi): stesso storage già usato da
  // ProtectedRouteComponent per la stessa decisione. Il project manager vede
  // "Dipendenti" come l'owner (per assegnare progetti), ma la pagina stessa
  // gli nasconde crea/modifica dipendente (vedi employees.tsx). useAuthUser
  // (invece di getUser diretto) fa ri-renderizzare questo componente quando
  // arriva 'user:updated' (es. l'owner promuove questo utente a manager
  // mentre è già sulla pagina), senza dover disconnettere e riconnettere.
  const role = useAuthUser()?.role;
  const canSeeEmployees = role === "owner" || role === "manager";
  const { pathname } = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const logoutItemRef = useRef<HTMLButtonElement>(null);

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
  const activeProjectLabel = activeProjectId ? activeProjectName ?? "Progetto" : undefined;

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
            error instanceof Error ? error.message : "Impossibile caricare i progetti.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isProjectsMenuOpen, projects]);

  useEffect(() => {
    if (!isMenuOpen) return;

    logoutItemRef.current?.focus();

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
      } else if (event.key === "Tab") {
        // Con un solo item il focus è già sull'unica voce: se l'utente esce
        // con Tab il menu deve chiudersi, altrimenti resta aperto e "orfano"
        // mentre il focus prosegue altrove nella pagina.
        setIsMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
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

  function handleProjectLinkClick() {
    setIsProjectsMenuOpen(false);
  }

  // Estratta perché lo stesso link/span attivo serve sia per Dashboard che
  // per Dipendenti, ora non più contigui nel markup (Progetti va tra i due).
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
      <nav className={styles.nav} aria-label="Navigazione principale">
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
            Progetti
            <svg
              className={styles.chevronIcon}
              data-open={isProjectsMenuOpen}
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          {isProjectsMenuOpen &&
            createPortal(
              <div
                ref={projectsPanelRef}
                id={projectsMenuId}
                role="menu"
                aria-label="Progetti"
                className={styles.projectsMenu}
              >
                {isLoadingProjects ? (
                  <p className={styles.projectsMenuStatus}>Caricamento...</p>
                ) : projectsError ? (
                  <p className={styles.projectsMenuStatus} role="alert">
                    {projectsError}
                  </p>
                ) : projects && projects.length === 0 ? (
                  <p className={styles.projectsMenuStatus}>Nessun progetto</p>
                ) : (
                  projects?.map((project, index) => (
                    <Link
                      key={project.id}
                      ref={index === 0 ? firstProjectItemRef : undefined}
                      role="menuitem"
                      className={styles.projectsMenuItem}
                      to={`/dashboard/${project.id}/task-list`}
                      aria-current={project.id === activeProjectId ? "true" : undefined}
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

        {activeProjectLabel && (
          <span className={styles.activeProjectLabel}>{activeProjectLabel}</span>
        )}

        {canSeeEmployees && renderNavItem({ to: "/employees", label: "Dipendenti" })}
      </nav>

      <span className={styles.logo}>
        <span className={styles.logoMark}>H</span>odum
      </span>

      <div className={styles.accountArea} ref={containerRef}>
        <button
          ref={accountButtonRef}
          type="button"
          className={styles.accountButton}
          aria-label="Menu account"
          aria-haspopup="menu"
          aria-expanded={isMenuOpen}
          aria-controls={menuId}
          onClick={() => setIsMenuOpen((current) => !current)}
        >
          <svg
            className={styles.accountIcon}
            viewBox="0 0 24 24"
            width="22"
            height="22"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="8" r="3.5" />
            <path d="M4.5 20c0-4.14 3.36-6.5 7.5-6.5s7.5 2.36 7.5 6.5" />
          </svg>
        </button>

        {isMenuOpen && (
          <div id={menuId} role="menu" className={styles.menu}>
            <button
              ref={logoutItemRef}
              type="button"
              role="menuitem"
              className={styles.menuItem}
              onClick={handleLogoutClick}
            >
              Disconnetti
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

export default TopbarComponent;
