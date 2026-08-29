import { API_BASE_URL, readErrorMessage } from "../httpClient";

export type AssistantRole = "user" | "assistant";

export interface AssistantMessage {
  role: AssistantRole;
  content: string;
}

export interface AssistantReply {
  reply: string;
  // Path assoluto (es. "/dashboard/<id>/task-list") quando l'assistente ha
  // chiesto di spostare l'utente su un'altra pagina: il backend non ha
  // accesso al router, quindi tocca al chiamante navigarci.
  navigateTo?: string;
}

// Rispecchia PageContext di assistantService.ts sul backend. Inviato solo
// quando l'utente ha il toggle "contesto pagina" attivo nel pannello: dice
// all'assistente in che pagina/progetto si trova in QUESTO turno, così non
// serve nominarlo esplicitamente in ogni messaggio.
export type PageContext = { page: "dashboard" } | { page: "task_list"; projectId: string };

// La cronologia va inviata per intero ad ogni richiesta: il backend non tiene
// stato di conversazione tra una chiamata e l'altra (vedi assistantController.ts).
export async function sendAssistantMessage(
  message: string,
  history: AssistantMessage[],
  pageContext?: PageContext,
): Promise<AssistantReply> {
  const response = await fetch(`${API_BASE_URL}/assistant/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history, pageContext }),
  });
  if (!response.ok) {
    const errorMessage = await readErrorMessage(response);
    throw new Error(errorMessage ?? "Impossibile contattare l'assistente.");
  }
  return (await response.json()) as AssistantReply;
}
