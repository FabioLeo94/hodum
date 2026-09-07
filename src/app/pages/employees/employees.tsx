import { Fragment, useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Plus } from "lucide-react";
import TopbarComponent from "../../components/topbar/topbarComponent";
import CreateEmployeeModalComponent from "../../components/createEmployeeModal/createEmployeeModalComponent";
import type { CreateEmployeeFormValues } from "../../components/createEmployeeModal/createEmployeeModalComponent";
import EditEmployeeModalComponent from "../../components/editEmployeeModal/editEmployeeModalComponent";
import type { EditEmployeeFormValues } from "../../components/editEmployeeModal/editEmployeeModalComponent";
import DeleteEmployeeModalComponent from "../../components/deleteEmployeeModal/deleteEmployeeModalComponent";
import DisableEmployeeModalComponent from "../../components/disableEmployeeModal/disableEmployeeModalComponent";
import type { AssistantLayoutContext } from "../../components/protectedLayout/protectedLayoutComponent";
import EmployeeCardComponent from "../../components/employeeCard/employeeCardComponent";
import MessageCardComponent from "../../components/messageCard/messageCardComponent";
import {
  listUsers,
  updateEmployee,
  deleteEmployee,
  disableEmployee,
  enableEmployee,
} from "../../services/user/userService";
import { createEmployee } from "../../services/company/companyService";
import { notifySuccess } from "../../services/notify/notifyService";
import { getUser, isAuthenticated, logout, useAuthUser } from "../../services/auth/authService";
import type { User } from "../../services/auth/authService";
import { usePageMeta } from "../../../shared/hooks/usePageMeta";
import { getDisplayName } from "../../../shared/utils/displayName";
import styles from "./employees.module.css";

function Employees() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const outletContext = useOutletContext<AssistantLayoutContext | undefined>();
  const isAssistantOpen = outletContext?.isAssistantOpen ?? false;
  const setHasLocalFab = outletContext?.setHasLocalFab;

  usePageMeta({ title: t("pages.employees.meta.title"), robots: "noindex, nofollow" });

  const [employees, setEmployees] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createError, setCreateError] = useState("");
  const [editingEmployee, setEditingEmployee] = useState<User | null>(null);
  const [editError, setEditError] = useState("");
  const [deletingEmployee, setDeletingEmployee] = useState<User | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [disablingEmployee, setDisablingEmployee] = useState<User | null>(null);
  const [disableError, setDisableError] = useState("");

  // Pannello riservato a owner e project manager: nessuna rotta protetta
  // filtra già per ruolo (ProtectedRouteComponent controlla solo
  // autenticazione e mustChangePassword), quindi la guardia va qui, stesso
  // pattern di changePassword.tsx. Il project manager vede la pagina in
  // modalità "sola assegnazione" (vedi canManageEmployees/canAssignProjects
  // sotto): niente crea/modifica dipendente, solo assegna progetti.
  useEffect(() => {
    if (!isAuthenticated()) {
      navigate("/auth", { replace: true });
      return;
    }
    const role = getUser()?.role;
    if (role !== "owner" && role !== "manager") {
      navigate("/dashboard", { replace: true });
    }
    // navigate è stabile per la durata del mount su questa rotta, stesso
    // motivo di auth.tsx.
  }, [navigate]);

  // useAuthUser (invece di getUser diretto) fa ri-renderizzare la pagina
  // quando arriva 'user:updated': un project manager appena promosso vede
  // subito "Assegna progetti" senza dover disconnettere e riconnettere.
  const viewerRole = useAuthUser()?.role;
  // Crea/modifica credenziali resta owner-only (task "Ruolo project
  // manager"): il PM non gestisce i dipendenti, li vede solo per assegnare
  // progetti.
  const canManageEmployees = viewerRole === "owner";
  const canAssignProjects = viewerRole === "owner" || viewerRole === "manager";

  // Il FAB "+" sotto è nascosto a un project manager (canManageEmployees
  // false): senza questo effect l'icona dell'assistente (montata nel
  // layout, non qui) resterebbe scostata come se il FAB ci fosse, stesso
  // principio di dashboard.tsx. Il cleanup riporta il layout al default
  // (true) quando si esce dalla pagina.
  useEffect(() => {
    setHasLocalFab?.(canManageEmployees);
    return () => setHasLocalFab?.(true);
  }, [canManageEmployees, setHasLocalFab]);

  useEffect(() => {
    let cancelled = false;

    listUsers()
      .then((users) => {
        if (!cancelled) {
          setEmployees(
            users.filter((user) => user.role === "employee" || user.role === "manager"),
          );
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : t("pages.employees.loadError"),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [t]);

  function handleLogout() {
    logout();
    navigate("/auth");
  }

  function openCreateModal() {
    setCreateError("");
    setIsCreateModalOpen(true);
  }

  function closeCreateModal() {
    setCreateError("");
    setIsCreateModalOpen(false);
  }

  async function handleCreateEmployee(values: CreateEmployeeFormValues) {
    const owner = getUser();
    if (!owner?.companyId) {
      setCreateError(t("pages.employees.invalidSession"));
      return;
    }
    try {
      const employee = await createEmployee(owner.companyId, values);
      setEmployees((current) => [...current, employee]);
      notifySuccess(t("pages.employees.createSuccess"));
      closeCreateModal();
    } catch (error) {
      setCreateError(
        error instanceof Error ? error.message : t("pages.employees.createError"),
      );
    }
  }

  function openEditModal(employee: User) {
    setEditError("");
    setEditingEmployee(employee);
  }

  function closeEditModal() {
    setEditError("");
    setEditingEmployee(null);
  }

  async function handleEditEmployee(values: EditEmployeeFormValues) {
    if (!editingEmployee) return;
    try {
      const updated = await updateEmployee(editingEmployee.id, values);
      setEmployees((current) =>
        current.map((employee) =>
          employee.id === updated.id ? updated : employee,
        ),
      );
      notifySuccess(t("pages.employees.editSuccess"));
      closeEditModal();
    } catch (error) {
      setEditError(
        error instanceof Error ? error.message : t("pages.employees.editError"),
      );
    }
  }

  function openDeleteModal(employee: User) {
    setDeleteError("");
    setDeletingEmployee(employee);
  }

  function closeDeleteModal() {
    setDeleteError("");
    setDeletingEmployee(null);
  }

  async function handleDeleteEmployee() {
    if (!deletingEmployee) return;
    try {
      await deleteEmployee(deletingEmployee.id);
      setEmployees((current) =>
        current.filter((employee) => employee.id !== deletingEmployee.id),
      );
      notifySuccess(t("pages.employees.deleteSuccess"));
      closeDeleteModal();
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : t("pages.employees.deleteError"),
      );
    }
  }

  function openDisableModal(employee: User) {
    setDisableError("");
    setDisablingEmployee(employee);
  }

  function closeDisableModal() {
    setDisableError("");
    setDisablingEmployee(null);
  }

  async function handleToggleDisable() {
    if (!disablingEmployee) return;
    const isCurrentlyDisabled = disablingEmployee.disabledAt !== null;
    try {
      const updated = isCurrentlyDisabled
        ? await enableEmployee(disablingEmployee.id)
        : await disableEmployee(disablingEmployee.id);
      setEmployees((current) =>
        current.map((employee) =>
          employee.id === updated.id ? updated : employee,
        ),
      );
      notifySuccess(
        t(isCurrentlyDisabled ? "pages.employees.enableSuccess" : "pages.employees.disableSuccess"),
      );
      closeDisableModal();
    } catch (error) {
      setDisableError(
        error instanceof Error
          ? error.message
          : t(isCurrentlyDisabled ? "pages.employees.enableError" : "pages.employees.disableError"),
      );
    }
  }

  return (
    <Fragment>
      <TopbarComponent onLogout={handleLogout} />
      <div className={styles.employeesContainer}>
        <header className={styles.employeesHeader}>
          {/* Stesso pattern icon-button di invoices.tsx: questa pagina non ha
              più un link diretto nella topbar (spostato come card dentro
              "Gestione aziendale", vedi companyManagement.tsx), quindi serve
              un modo per tornare indietro senza passare dalla dashboard. */}
          <div className={styles.titleGroup}>
            <button
              type="button"
              className={styles.backButton}
              aria-label={t("pages.employees.backLabel")}
              onClick={() => navigate("/company-management")}
            >
              <ArrowLeft size={18} aria-hidden="true" />
            </button>
            <h1 className={styles.employeesTitle}>{t("pages.employees.title")}</h1>
          </div>
          <p className={styles.employeesSubtitle} role="status">
            {isLoading
              ? t("pages.employees.subtitleLoading")
              : employees.length === 0
                ? t("pages.employees.subtitleEmpty")
                : t("pages.employees.subtitleCount", { count: employees.length })}
          </p>
        </header>

        {loadError ? (
          <MessageCardComponent
            variant="error"
            role="alert"
            title={t("pages.employees.loadErrorTitle")}
            text={loadError}
          />
        ) : !isLoading && employees.length === 0 ? (
          <MessageCardComponent
            title={t("pages.employees.emptyTitle")}
            text={t("pages.employees.emptyText")}
          />
        ) : !isLoading ? (
          <ul className={styles.employeesList}>
            {employees.map((employee) => (
              <EmployeeCardComponent
                key={employee.id}
                employee={employee}
                canManageEmployees={canManageEmployees}
                canAssignProjects={canAssignProjects}
                onEdit={openEditModal}
                onToggleDisable={openDisableModal}
                onDelete={openDeleteModal}
              />
            ))}
          </ul>
        ) : null}

        {canManageEmployees && (
          <Fragment>
            <button
              type="button"
              className={styles.fabButton}
              data-assistant-open={isAssistantOpen}
              aria-label={t("pages.employees.createButtonLabel")}
              onClick={openCreateModal}
            >
              <Plus className={styles.fabIcon} size={24} strokeWidth={2.5} aria-hidden="true" />
            </button>

            <CreateEmployeeModalComponent
              isOpen={isCreateModalOpen}
              onClose={closeCreateModal}
              onCreate={handleCreateEmployee}
              submitError={createError}
            />

            {editingEmployee && (
              <EditEmployeeModalComponent
                key={editingEmployee.id}
                isOpen={editingEmployee !== null}
                onClose={closeEditModal}
                currentUsername={editingEmployee.username}
                currentFirstName={editingEmployee.firstName}
                currentLastName={editingEmployee.lastName}
                currentPronoun={editingEmployee.pronoun}
                currentRole={editingEmployee.role === "manager" ? "manager" : "employee"}
                currentEmail={editingEmployee.email}
                currentCreatedAt={editingEmployee.createdAt}
                currentLastLoginAt={editingEmployee.lastLoginAt}
                onSave={handleEditEmployee}
                submitError={editError}
              />
            )}

            {deletingEmployee && (
              <DeleteEmployeeModalComponent
                key={deletingEmployee.id}
                isOpen={deletingEmployee !== null}
                onClose={closeDeleteModal}
                employeeDisplayName={getDisplayName(deletingEmployee)}
                onConfirm={handleDeleteEmployee}
                submitError={deleteError}
              />
            )}

            {disablingEmployee && (
              <DisableEmployeeModalComponent
                key={disablingEmployee.id}
                isOpen={disablingEmployee !== null}
                onClose={closeDisableModal}
                employeeDisplayName={getDisplayName(disablingEmployee)}
                onConfirm={handleToggleDisable}
                submitError={disableError}
                mode={disablingEmployee.disabledAt !== null ? "enable" : "disable"}
              />
            )}
          </Fragment>
        )}
      </div>
    </Fragment>
  );
}

export default Employees;
