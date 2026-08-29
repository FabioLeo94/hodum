import { Body, Controller, Post, Response, Route } from 'tsoa';
import { askAssistant } from '../services/assistantService';
import type { AssistantMessage, PageContext } from '../services/assistantService';
import { OllamaError } from '../services/ollamaClient';

// Nome distinto dagli omonimi "ErrorResponse" degli altri controller: tsoa
// risolve i modelli per nome dell'interfaccia a livello globale (non per
// file), quindi collidono in generazione se condivisi.
interface AssistantErrorResponse {
  message: string;
}

export interface AssistantChatRequest {
  message: string;
  // Cronologia gestita lato client (nessuna persistenza server-side per ora,
  // coerente con l'assenza di uno store centralizzato nel frontend): ogni
  // richiesta la invia per intero.
  history?: AssistantMessage[];
  // Presente solo quando l'utente ha il toggle "contesto pagina" attivo nel
  // pannello: dice in che pagina/progetto si trova in QUESTO turno. Assente
  // (contesto generico) se il toggle è disattivo.
  pageContext?: PageContext;
}

export interface AssistantChatResponse {
  reply: string;
  navigateTo?: string;
}

@Route('assistant')
export class AssistantController extends Controller {
  @Post('chat')
  @Response<AssistantErrorResponse>(422, 'message mancante o vuoto')
  @Response<AssistantErrorResponse>(502, 'Ollama non raggiungibile o in errore')
  public async chat(
    @Body() body: AssistantChatRequest,
  ): Promise<AssistantChatResponse | AssistantErrorResponse> {
    if (body.message.trim().length === 0) {
      this.setStatus(422);
      return { message: 'message non può essere vuoto' };
    }

    try {
      return await askAssistant(body.message, body.history ?? [], body.pageContext);
    } catch (err) {
      if (err instanceof OllamaError) {
        // 502 (Bad Gateway): il problema è nel servizio a valle (Ollama non
        // avviato, modello non scaricato, timeout), non nella richiesta del
        // client.
        this.setStatus(502);
        return { message: err.message };
      }
      throw err;
    }
  }
}
