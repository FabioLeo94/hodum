import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { EllipsisVertical } from "lucide-react";
import AvatarComponent from "../avatar/avatarComponent";
import type { User } from "../../services/auth/authService";
import { getDisplayName } from "../../../shared/utils/displayName";
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
  onAssign: (employee: User) => void;
  onDelete: (employee: User) => void;
}

function EmployeeCardComponent({
  employee,
  canManageEmployees,
  canAssignProjects,
  onEdit,
  onToggleDisable,
  onAssign,
  onDelete,
}: Prop) {
  const { t } = useTranslation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuId = useId();
  const kebabContainerRef = useRef<HTMLDivElement>(null);
  const kebabButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isMenuOpen) return;

    // Le voci del menu sono condizionali (edit/disable/assign/delete non
    // dipendono tutte dalla stessa guardia), quindi il focus iniziale va
    // cercato nel DOM invece che fissato su un ref specifico: non si può
    // sapere in anticipo quale sarà la prima voce effettivamente renderizzata.
    const firstMenuItem = kebabContainerRef.current?.querySelector<HTMLButtonElement>(
      '[role="menuitem"]',
    );
    firstMenuItem?.focus();

    function handlePointerDown(event: PointerEvent) {
      if (
        kebabContainerRef.current &&
        !kebabContainerRef.current.contains(event.target as Node)
      ) {
        setIsMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
        kebabButtonRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMenuOpen]);

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

  function handleAssign() {
    setIsMenuOpen(false);
    onAssign(employee);
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
            aria-haspopup="menu"
            aria-expanded={isMenuOpen}
            aria-controls={menuId}
            onClick={() => setIsMenuOpen((current) => !current)}
          >
            <EllipsisVertical size={18} aria-hidden="true" />
          </button>
          {isMenuOpen && (
            <div id={menuId} role="menu" className={styles.popoverMenu}>
              {canManageEmployees && (
                <button
                  type="button"
                  role="menuitem"
                  className={styles.popoverItem}
                  onClick={handleEdit}
                >
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
                  onClick={handleAssign}
                >
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
