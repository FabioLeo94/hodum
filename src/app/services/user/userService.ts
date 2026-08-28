// URL base dell'API backend. Il fallback coincide con la porta di default del
// server Express (vedi backend/.env.example, PORT=3000). Quando il progetto
// introdurrà un flusso di configurazione per ambiente, valorizzare
// VITE_API_URL in un file .env sostituirà questo default senza altre modifiche.
const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

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

interface ErrorResponseBody {
  message?: string;
}

async function readErrorMessage(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as ErrorResponseBody;
    return body.message;
  } catch {
    return undefined;
  }
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
