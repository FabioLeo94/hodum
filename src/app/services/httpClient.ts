// URL base dell'API backend. Il fallback coincide con la porta di default del
// server Express (vedi backend/.env.example, PORT=3000). Quando il progetto
// introdurrà un flusso di configurazione per ambiente, valorizzare
// VITE_API_URL in un file .env sostituirà questo default senza altre modifiche.
export const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

interface ErrorResponseBody {
  message?: string;
}

export async function readErrorMessage(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as ErrorResponseBody;
    return body.message;
  } catch {
    return undefined;
  }
}
