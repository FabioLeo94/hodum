import { API_BASE_URL, readErrorMessage } from "../httpClient";

export interface CreateUserInput {
  username: string;
  email: string;
  password: string;
}

export interface User {
  id: string;
  username: string;
  email: string;
}

export async function createUser(input: CreateUserInput): Promise<User> {
  const response = await fetch(`${API_BASE_URL}/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    if (response.status === 409) {
      throw new Error(message ?? "Username o email già in uso.");
    }
    if (response.status === 422) {
      throw new Error(message ?? "Dati non validi. Controlla i campi inseriti.");
    }
    throw new Error(message ?? "Registrazione non riuscita. Riprova più tardi.");
  }

  return (await response.json()) as User;
}
