import { API_BASE_URL, readErrorMessage } from "../httpClient";
import { authHeader, type User } from "../auth/authService";

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
