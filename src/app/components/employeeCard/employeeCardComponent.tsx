import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  EllipsisVertical,
  FolderPlus,
  Pencil,
  Trash2,
  UserCheck,
  UserX,
} from "lucide-react";
import AvatarComponent from "../avatar/avatarComponent";
import type { User } from "../../services/auth/authService";
import { getDisplayName } from "../../../shared/utils/displayName";
import { listProjectsSummary, type ProjectSummary } from "../../services/project/projectService";
import { getAssignedProjectIds, setAssignedProjects } from "../../services/user/userService";
import { notifyError, notifySuccess } from "../../services/notify/notifyService";
import styles from "./employeeCardComponent.module.css";

interface Prop {
  employee: User;
  canManageEmployees: boolean;
  // Task "Gestione del dipendente": un project manager può assegnare
  // progetti ma non gestire le credenziali, quindi questo flag e
  // canManageEmployees restano indipendenti (vedi employees.tsx).
  canAssignProjects: boolean;
  onEdit: (employee: User) => void;
  onToggleDisable: (employee: User) => void;
  onDelete: (employee: User) => void;
}

function areSameProjectIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const bSet = new Set(b);
  return a.every((id) => bSet.has(id));
}

function EmployeeCardComponent({
  employee,
  canManageEmployees,
  canAssignProjects,
  onEdit,
  onToggleDisable,
  onDelete,
}: Prop) {
  const { t } = useTranslation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [assignView, setAssignView] = useState(false);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const initialProjectIdsRef = useRef<string[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [projectsLoadError, setProjectsLoadError] = useState("");
  const menuId = useId();
  const kebabContainerRef = useRef<HTMLDivElement>(null);
  const kebabButtonRef = useRef<HTMLButtonElement>(null);
  const assignBackButtonRef = useRef<HTMLButtonElement>(null);

  // Il popover si può chiudere da tre punti diversi (click fuori, Escape,
  // toggle del bottone kebab) mentre il pannello di assegnazione è aperto:
  // invece di aggiungere selectedProjectIds/isLoadingProjects/
  // projectsLoadError alle dipendenze dell'effect sottostante (che
  // ristaccherebbe i listener a ogni click su una checkbox e rubrebbe il
  // focus), teniamo un ref sempre aggiornato che le chiusure leggono al
  // momento della chiusura effettiva.
  const assignStateRef = useRef({ assignView: false, selectedProjectIds: [] as string[], canSave: false });
  useEffect(() => {
    assignStateRef.current = {
      assignView,
      selectedProjectIds,
      canSave: !isLoadingProjects && !projectsLoadError,
    };
  }, [assignView, selectedProjectIds, isLoadingProjects, projectsLoadError]);

  // Carica progetti e assegnazioni correnti ogni volta che il pannello si
  // apre, stesso pattern (Promise.all + cancel flag) della vecchia modale.
  useEffect(() => {
    if (!assignView) return;
    let cancelled = false;

    Promise.all([listProjectsSummary(), getAssignedProjectIds(employee.id)])
      .then(([allProjects, assignedIds]) => {
        if (cancelled) return;
        setProjects(allProjects);
        setSelectedProjectIds(assignedIds);
        initialProjectIdsRef.current = assignedIds;
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setProjectsLoadError(
            error instanceof Error ? error.message : t("pages.employees.assignPanel.loadError"),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingProjects(false);
      });

    return () => {
      cancelled = true;
    };
  }, [assignView, employee.id, t]);

  // Invia un'unica chiamata con la selezione corrente quando si lascia il
  // pannello di assegnazione (tornando al menu o chiudendo il popover), non
  // a ogni checkbox: niente da salvare se il caricamento non è mai riuscito.
  const finishAssigning = useCallback(() => {
    const state = assignStateRef.current;
    if (!state.assignView || !state.canSave) return;
    if (areSameProjectIds(state.selectedProjectIds, initialProjectIdsRef.current)) return;
    setAssignedProjects(employee.id, state.selectedProjectIds)
      .then(() => notifySuccess(t("pages.employees.assignSuccess")))
      .catch((error: unknown) => {
        notifyError(error instanceof Error ? error.message : t("pages.employees.assignError"));
      });
  }, [employee.id, t]);

  useEffect(() => {
    if (!isMenuOpen) return;

    // Le voci del menu sono condizionali (edit/disable/assign/delete non
    // dipendono tutte dalla stessa guardia), quindi il focus iniziale va
    // cercato nel DOM invece che fissato su un ref specifico: non si può
    // sapere in anticipo quale sarà la prima voce effettivamente renderizzata.
    // Rifatto anche al ritorno dal pannello di assegnazione al menu
    // (assignView torna false a isMenuOpen invariato).
    const elementToFocus = assignView
      ? assignBackButtonRef.current
      : kebabContainerRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]');
    elementToFocus?.focus();

    function handlePointerDown(event: PointerEvent) {
      if (
        kebabContainerRef.current &&
        !kebabContainerRef.current.contains(event.target as Node)
      ) {
        finishAssigning();
        setIsMenuOpen(false);
        setAssignView(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      finishAssigning();
      if (assignView) {
        // Un livello alla volta: Escape nel sub-pannello torna al menu,
        // esattamente come il bottone "indietro".
        setAssignView(false);
        return;
      }
      setIsMenuOpen(false);
      kebabButtonRef.current?.focus();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMenuOpen, assignView, finishAssigning]);

  const employeeDisplayName = getDisplayName(employee);
  const isDisabled = employee.disabledAt !== null;
  const canAssignThisEmployee = canAssignProjects && employee.role === "employee";
  const hasAnyAction = canManageEmployees || canAssignThisEmployee;

  function handleEdit() {
    setIsMenuOpen(false);
    onEdit(employee);
  }

  function handleToggleDisable() {
    setIsMenuOpen(false);
    onToggleDisable(employee);
  }

  function handleAssignClick() {
    // Reset qui (evento, non nel body dell'effect) di isLoadingProjects e
    // projectsLoadError: il sub-pannello non si rimonta come faceva la
    // vecchia modale (key sull'employee), quindi senza questo reset
    // riaprirlo dopo un caricamento fallito mostrerebbe di nuovo l'errore
    // per un istante prima che l'effect (keyed su assignView) riparta.
    setIsLoadingProjects(true);
    setProjectsLoadError("");
    setAssignView(true);
  }

  function handleBackFromAssign() {
    finishAssigning();
    setAssignView(false);
  }

  function handleKebabButtonClick() {
    if (isMenuOpen) {
      finishAssigning();
    }
    setIsMenuOpen((current) => !current);
    setAssignView(false);
  }

  function toggleProject(projectId: string) {
    setSelectedProjectIds((current) =>
      current.includes(projectId)
        ? current.filter((id) => id !== projectId)
        : [...current, projectId],
    );
  }

  function handleDelete() {
    setIsMenuOpen(false);
    onDelete(employee);
  }

  return (
    <li className={styles.employeeCard}>
      <AvatarComponent displayName={employeeDisplayName} size="lg" />
      <div className={styles.employeeInfo}>
        <span className={styles.employeeUsername} title={employeeDisplayName}>
          {employeeDisplayName}
        </span>
        <span className={styles.employeeEmail}>{employee.email}</span>
      </div>
      <span className={styles.employeeRoleBadge} data-role={employee.role}>
        {employee.role === "manager"
          ? t("pages.employees.roleBadge.manager")
          : t("pages.employees.roleBadge.employee")}
      </span>
      <span
        className={styles.employeeStatus}
        data-disabled={isDisabled}
        data-pending={employee.mustChangePassword}
      >
        {isDisabled
          ? t("pages.employees.status.disabled")
          : employee.mustChangePassword
            ? t("pages.employees.status.pending")
            : t("pages.employees.status.active")}
      </span>
      {hasAnyAction && (
        <div className={styles.kebabArea} ref={kebabContainerRef}>
          <button
            ref={kebabButtonRef}
            type="button"
            className={styles.kebabButton}
            aria-label={t("pages.employees.otherActionsLabel", { employeeDisplayName })}
            aria-haspopup={assignView ? "dialog" : "menu"}
            aria-expanded={isMenuOpen}
            aria-controls={menuId}
            onClick={handleKebabButtonClick}
          >
            <EllipsisVertical size={18} aria-hidden="true" />
          </button>
          {isMenuOpen && assignView && (
            <div id={menuId} className={`${styles.popoverMenu} ${styles.assignPanel}`}>
              <div className={styles.assignHeader}>
                <button
                  ref={assignBackButtonRef}
                  type="button"
                  className={styles.assignBackButton}
                  aria-label={t("pages.employees.assignPanel.backLabel")}
                  onClick={handleBackFromAssign}
                >
                  <ArrowLeft size={16} aria-hidden="true" />
                </button>
                <span className={styles.assignTitle}>
                  {t("pages.employees.assignPanel.title")}
                </span>
              </div>
              {isLoadingProjects ? (
                <p className={styles.assignStatusText} role="status">
                  {t("pages.employees.assignPanel.loading")}
                </p>
              ) : projectsLoadError ? (
                <p role="alert" className={styles.assignStatusText}>
                  {projectsLoadError}
                </p>
              ) : projects.length === 0 ? (
                <p className={styles.assignStatusText}>
                  {t("pages.employees.assignPanel.empty")}
                </p>
              ) : (
                <ul className={styles.assignProjectList}>
                  {projects.map((project) => (
                    <li key={project.id}>
                      <label className={styles.assignProjectLabel}>
                        <input
                          type="checkbox"
                          className={styles.assignCheckbox}
                          checked={selectedProjectIds.includes(project.id)}
                          onChange={() => toggleProject(project.id)}
                        />
                        {project.name}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {isMenuOpen && !assignView && (
            <div id={menuId} role="menu" className={styles.popoverMenu}>
              {canManageEmployees && (
                <button
                  type="button"
                  role="menuitem"
                  className={styles.popoverItem}
                  onClick={handleEdit}
                >
                  <Pencil size={14} aria-hidden="true" />
                  {t("pages.employees.menu.edit")}
                </button>
              )}
              {canManageEmployees && (
                <button
                  type="button"
                  role="menuitem"
                  className={styles.popoverItem}
                  onClick={handleToggleDisable}
                >
                  {isDisabled ? (
                    <UserCheck size={14} aria-hidden="true" />
                  ) : (
                    <UserX size={14} aria-hidden="true" />
                  )}
                  {t(isDisabled ? "pages.employees.menu.enable" : "pages.employees.menu.disable")}
                </button>
              )}
              {/* Assegnare progetti a un project manager non ha senso: ha già
                  accesso a tutti i progetti della company (vedi
                  @Security('manager') lato backend), non serve
                  un'assegnazione esplicita come per un dipendente. */}
              {canAssignThisEmployee && (
                <button
                  type="button"
                  role="menuitem"
                  className={styles.popoverItem}
                  onClick={handleAssignClick}
                >
                  <FolderPlus size={14} aria-hidden="true" />
                  {t("pages.employees.menu.assign")}
                </button>
              )}
              {canManageEmployees && (
                <>
                  <div className={styles.popoverSeparator} role="separator" />
                  <button
                    type="button"
                    role="menuitem"
                    className={`${styles.popoverItem} ${styles.popoverItemDanger}`}
                    onClick={handleDelete}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                    {t("pages.employees.menu.delete")}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export default EmployeeCardComponent;
