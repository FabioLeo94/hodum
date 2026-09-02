import { Fragment, useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router";
import TopbarComponent from "../../components/topbar/topbarComponent";
import CreateEmployeeModalComponent from "../../components/createEmployeeModal/createEmployeeModalComponent";
import type { CreateEmployeeFormValues } from "../../components/createEmployeeModal/createEmployeeModalComponent";
import EditEmployeeModalComponent from "../../components/editEmployeeModal/editEmployeeModalComponent";
import type { EditEmployeeFormValues } from "../../components/editEmployeeModal/editEmployeeModalComponent";
import AssignProjectsModalComponent from "../../components/assignProjectsModal/assignProjectsModalComponent";
import DeleteEmployeeModalComponent from "../../components/deleteEmployeeModal/deleteEmployeeModalComponent";
import type { AssistantLayoutContext } from "../../components/protectedLayout/protectedLayoutComponent";
import {
  listUsers,
  updateEmployee,
  setAssignedProjects,
  deleteEmployee,
} from "../../services/user/userService";
import { createEmployee } from "../../services/company/companyService";
import { getUser, isAuthenticated, logout, useAuthUser } from "../../services/auth/authService";
import type { User } from "../../services/auth/authService";
import { usePageMeta } from "../../../shared/hooks/usePageMeta";
import styles from "./employees.module.css";

function Employees() {
  const navigate = useNavigate();
  const outletContext = useOutletContext<AssistantLayoutContext | undefined>();
  const isAssistantOpen = outletContext?.isAssistantOpen ?? false;
  const setHasLocalFab = outletContext?.setHasLocalFab;

  usePageMeta({ title: "Dipendenti", robots: "noindex, nofollow" });

  const [employees, setEmployees] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createError, setCreateError] = useState("");
  const [editingEmployee, setEditingEmployee] = useState<User | null>(null);
  const [editError, setEditError] = useState("");
  const [assigningEmployee, setAssigningEmployee] = useState<User | null>(null);
  const [assignError, setAssignError] = useState("");
  const [deletingEmployee, setDeletingEmployee] = useState<User | null>(null);
  const [deleteError, setDeleteError] = useState("");

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
            error instanceof Error
              ? error.message
              : "Impossibile caricare i dipendenti.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

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
      setCreateError("Sessione non valida. Effettua nuovamente l'accesso.");
      return;
    }
    try {
      const employee = await createEmployee(owner.companyId, values);
      setEmployees((current) => [...current, employee]);
      closeCreateModal();
    } catch (error) {
      setCreateError(
        error instanceof Error
          ? error.message
          : "Impossibile creare il dipendente.",
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
      closeEditModal();
    } catch (error) {
      setEditError(
        error instanceof Error
          ? error.message
          : "Impossibile aggiornare il dipendente.",
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
      closeDeleteModal();
    } catch (error) {
      setDeleteError(
        error instanceof Error
          ? error.message
          : "Impossibile eliminare il dipendente.",
      );
    }
  }

  function openAssignModal(employee: User) {
    setAssignError("");
    setAssigningEmployee(employee);
  }

  function closeAssignModal() {
    setAssignError("");
    setAssigningEmployee(null);
  }

  async function handleAssignProjects(projectIds: string[]) {
    if (!assigningEmployee) return;
    try {
      await setAssignedProjects(assigningEmployee.id, projectIds);
      closeAssignModal();
    } catch (error) {
      setAssignError(
        error instanceof Error
          ? error.message
          : "Impossibile aggiornare i progetti assegnati.",
      );
    }
  }

  return (
    <Fragment>
      <TopbarComponent onLogout={handleLogout} />
      <div className={styles.employeesContainer}>
        <header className={styles.employeesHeader}>
          <h1 className={styles.employeesTitle}>Dipendenti</h1>
          <p className={styles.employeesSubtitle} role="status">
            {isLoading
              ? "Caricamento dei dipendenti..."
              : employees.length === 0
                ? "Nessun dipendente registrato al momento."
                : `${employees.length} dipendent${employees.length === 1 ? "e" : "i"} registrat${employees.length === 1 ? "o" : "i"}.`}
          </p>
        </header>

        {loadError ? (
          <div className={styles.emptyState} data-variant="error" role="alert">
            <p className={styles.emptyStateTitle}>Errore di caricamento</p>
            <p className={styles.emptyStateText}>{loadError}</p>
          </div>
        ) : !isLoading && employees.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyStateTitle}>Nessun dipendente ancora</p>
            <p className={styles.emptyStateText}>
              Crea le credenziali di un dipendente per farlo accedere alla tua
              azienda.
            </p>
          </div>
        ) : !isLoading ? (
          <ul className={styles.employeesList}>
            {employees.map((employee) => (
              <li key={employee.id} className={styles.employeeCard}>
                <div className={styles.employeeInfo}>
                  <span className={styles.employeeUsername}>
                    {employee.username}
                  </span>
                  <span className={styles.employeeEmail}>{employee.email}</span>
                </div>
                <span
                  className={styles.employeeRoleBadge}
                  data-role={employee.role}
                >
                  {employee.role === "manager" ? "Project Manager" : "Dipendente"}
                </span>
                <span
                  className={styles.employeeStatus}
                  data-pending={employee.mustChangePassword}
                >
                  {employee.mustChangePassword
                    ? "In attesa del primo accesso"
                    : "Attivo"}
                </span>
                <div className={styles.employeeActions}>
                  {canManageEmployees && (
                    <button
                      type="button"
                      className={styles.iconButton}
                      aria-label={`Modifica dipendente ${employee.username}`}
                      onClick={() => openEditModal(employee)}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="16"
                        height="16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                    </button>
                  )}
                  {/* Assegnare progetti a un project manager non ha senso: ha
                      già accesso a tutti i progetti della company (vedi
                      @Security('manager') lato backend), non serve
                      un'assegnazione esplicita come per un dipendente. */}
                  {canAssignProjects && employee.role === "employee" && (
                    <button
                      type="button"
                      className={styles.iconButton}
                      aria-label={`Assegna progetti a ${employee.username}`}
                      onClick={() => openAssignModal(employee)}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="16"
                        height="16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M9 11l3 3L22 4" />
                        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                      </svg>
                    </button>
                  )}
                  {canManageEmployees && (
                    <button
                      type="button"
                      className={`${styles.iconButton} ${styles.iconButtonDanger}`}
                      aria-label={`Elimina dipendente ${employee.username}`}
                      onClick={() => openDeleteModal(employee)}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="16"
                        height="16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M3 6h18" />
                        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6" />
                        <path d="M14 11v6" />
                      </svg>
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        {canManageEmployees && (
          <Fragment>
            <button
              type="button"
              className={styles.fabButton}
              data-assistant-open={isAssistantOpen}
              aria-label="Crea nuovo dipendente"
              onClick={openCreateModal}
            >
              <svg
                className={styles.fabIcon}
                viewBox="0 0 24 24"
                width="24"
                height="24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
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
                currentRole={editingEmployee.role === "manager" ? "manager" : "employee"}
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
                employeeUsername={deletingEmployee.username}
                onConfirm={handleDeleteEmployee}
                submitError={deleteError}
              />
            )}
          </Fragment>
        )}

        {assigningEmployee && (
          <AssignProjectsModalComponent
            key={assigningEmployee.id}
            isOpen={assigningEmployee !== null}
            onClose={closeAssignModal}
            employeeId={assigningEmployee.id}
            employeeUsername={assigningEmployee.username}
            onSave={handleAssignProjects}
            submitError={assignError}
          />
        )}
      </div>
    </Fragment>
  );
}

export default Employees;
