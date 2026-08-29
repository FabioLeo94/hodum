// Client HTTP minimale verso l'API di Ollama (/api/chat), che espone un formato
// di tool-calling analogo a quello OpenAI: il modello non esegue le funzioni,
// restituisce quali chiamare e con che argomenti; l'esecuzione resta lato nostro
// (vedi assistantService.ts).

export class OllamaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OllamaError';
  }
}

export type OllamaRole = 'system' | 'user' | 'assistant' | 'tool';

export interface OllamaToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

export interface OllamaChatMessage {
  role: OllamaRole;
  content: string;
  tool_calls?: OllamaToolCall[];
}

export interface OllamaToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

interface OllamaChatRequest {
  model: string;
  messages: OllamaChatMessage[];
  tools?: OllamaToolDefinition[];
  stream: false;
  options?: {
    temperature?: number;
  };
}

interface OllamaChatApiResponse {
  message: OllamaChatMessage;
  done: boolean;
}

// Timeout esplicito: un modello da 14B su GPU con poca VRAM può richiedere
// offload parziale su CPU, molto più lento. Senza timeout una richiesta persa
// terrebbe agganciata la richiesta HTTP del frontend a tempo indeterminato.
const REQUEST_TIMEOUT_MS = 120_000;

export async function ollamaChat(request: OllamaChatRequest): Promise<OllamaChatMessage> {
  const baseUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
  } catch (err) {
    // fetch lancia sia per connessione rifiutata (Ollama non avviato) sia per
    // abort da timeout: entrambi i casi sono un "Ollama non raggiungibile" dal
    // punto di vista del chiamante, distinguerli non aiuterebbe l'utente finale.
    throw new OllamaError(
      `Impossibile contattare Ollama su ${baseUrl}: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new OllamaError(`Ollama ha risposto con status ${response.status}${body ? `: ${body}` : ''}`);
  }

  const data = (await response.json()) as OllamaChatApiResponse;
  return data.message;
}
