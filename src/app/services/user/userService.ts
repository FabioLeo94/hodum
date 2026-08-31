import { API_BASE_URL, readErrorMessage } from "../httpClient";
import { authHeader, type User } from "../auth/authService";

interface ProjectDto {
  id: string;
  name: string;
  isActive: boolean;
}

// GET /users è già filtrato lato backend sulla company del richiedente
// (userController.ts -> listUsers(requester.companyId)): qui non serve
// passare alcun id, la scoping avviene tramite il token nell'header.
export async function listUsers(): Promise<User[]> {
  const response = await fetch(`${API_BASE_URL}/users`, {
    headers: authHeader(),
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message ?? "Impossibile caricare gli utenti. Riprova più tardi.");
  }

  return (await response.json()) as User[];
}

// Unica rotta protetta raggiungibile anche quando mustChangePassword è true
// (vedi backend/src/middleware/authentication.ts): tutte le altre rotte
// protette rispondono 428 in quello stato.
export async function changePassword(userId: string, password: string): Promise<User> {
  const response = await fetch(`${API_BASE_URL}/users/${userId}/password`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify({ password }),
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    if (response.status === 422) {
      throw new Error(message ?? "Password non valida.");
    }
    throw new Error(message ?? "Cambio password non riuscito. Riprova più tardi.");
  }

  return (await response.json()) as User;
}

// Task "Gestione del dipendente": PUT /users/{id} instrada già lato backend
// sia il self-service sia l'owner-su-un-proprio-dipendente (stesso endpoint di
// updateUser, vedi userController.ts), quindi qui basta chiamarlo con i campi
// che l'owner può cambiare — password vuota/omessa lascia quella esistente.
export async function updateEmployee(
  id: string,
  values: { username?: string; password?: string; role?: "employee" | "manager" },
): Promise<User> {
  const response = await fetch(`${API_BASE_URL}/users/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify(values),
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    if (response.status === 422) {
      throw new Error(message ?? "Dati non validi.");
    }
    if (response.status === 409) {
      throw new Error(message ?? "Username o email già in uso.");
    }
    throw new Error(message ?? "Impossibile aggiornare il dipendente. Riprova più tardi.");
  }

  return (await response.json()) as User;
}

export async function getAssignedProjectIds(employeeId: string): Promise<string[]> {
  const response = await fetch(`${API_BASE_URL}/users/${employeeId}/projects`, {
    headers: authHeader(),
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message ?? "Impossibile caricare i progetti assegnati.");
  }

  const projects = (await response.json()) as ProjectDto[];
  return projects.map((project) => project.id);
}

// Replace-all: sostituisce l'intero set di assegnazioni del dipendente con
// projectIds (stesso pattern lato backend, vedi setProjectAssignments in
// projectAssignmentService.ts).
export async function setAssignedProjects(employeeId: string, projectIds: string[]): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/users/${employeeId}/projects`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify({ projectIds }),
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message ?? "Impossibile aggiornare i progetti assegnati.");
  }
}
