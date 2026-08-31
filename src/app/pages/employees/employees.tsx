import { Fragment, useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router";
import TopbarComponent from "../../components/topbar/topbarComponent";
import CreateEmployeeModalComponent from "../../components/createEmployeeModal/createEmployeeModalComponent";
import EditEmployeeModalComponent from "../../components/editEmployeeModal/editEmployeeModalComponent";
import AssignProjectsModalComponent from "../../components/assignProjectsModal/assignProjectsModalComponent";
import type { AssistantLayoutContext } from "../../components/protectedLayout/protectedLayoutComponent";
import {
  listUsers,
  updateEmployee,
  setAssignedProjects,
} from "../../services/user/userService";
import { createEmployee } from "../../services/company/companyService";
import { getUser, isAuthenticated, logout } from "../../services/auth/authService";
import type { User } from "../../services/auth/authService";
import { usePageMeta } from "../../../shared/hooks/usePageMeta";
import styles from "./employees.module.css";

function Employees() {
  const navigate = useNavigate();
  const isAssistantOpen =
    useOutletContext<AssistantLayoutContext | undefined>()?.isAssistantOpen ??
    false;

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

  // Pannello riservato all'owner: nessuna rotta protetta filtra già per
  // ruolo (ProtectedRouteComponent controlla solo autenticazione e
  // mustChangePassword), quindi la guardia va qui, stesso pattern di
  // changePassword.tsx.
  useEffect(() => {
    if (!isAuthenticated()) {
      navigate("/auth", { replace: true });
      return;
    }
    if (getUser()?.role !== "owner") {
      navigate("/dashboard", { replace: true });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    listUsers()
      .then((users) => {
        if (!cancelled) {
          setEmployees(users.filter((user) => user.role === "employee"));
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

  async function handleCreateEmployee(values: {
    username: string;
    email: string;
    password: string;
  }) {
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

  async function handleEditEmployee(values: {
    username: string;
    password?: string;
  }) {
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
                  className={styles.employeeStatus}
                  data-pending={employee.mustChangePassword}
                >
                  {employee.mustChangePassword
                    ? "In attesa del primo accesso"
                    : "Attivo"}
                </span>
                <div className={styles.employeeActions}>
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
                </div>
              </li>
            ))}
          </ul>
        ) : null}

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
            onSave={handleEditEmployee}
            submitError={editError}
          />
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
