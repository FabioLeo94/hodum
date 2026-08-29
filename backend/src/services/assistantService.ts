import { ollamaChat, OllamaError } from './ollamaClient';
import type { OllamaChatMessage, OllamaToolCall, OllamaToolDefinition } from './ollamaClient';
import { listProjects } from './projectService';
import {
  createTask,
  deleteTask,
  listTasksByProject,
  ProjectNotFoundError,
  TaskNotFoundError,
  updateTask,
  updateTaskStatus,
} from './taskService';
import type { TaskStatus } from '../models/task';
import { isValidUuid } from '../utils/uuid';

export interface AssistantMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Un solo modello per l'intero processo: cambiarlo (es. per confrontare
// qwen2.5:7b vs 14b) è un riavvio del server con OLLAMA_MODEL diverso, non una
// modifica di codice.
const MODEL = process.env.OLLAMA_MODEL ?? 'qwen2.5:14b';

// Stessi slug del dominio applicativo (vedi models/task.ts): dichiarati qui
// come enum esplicito nello schema del tool, così un modello quantizzato non
// può inventare uno stato che poi fallisce silenziosamente in updateTaskStatus.
const TASK_STATUS_VALUES: TaskStatus[] = ['progress', 'review', 'completed', 'rejected'];

// Il modello non ha accesso diretto al database: questi sono gli unici modi
// in cui può "vedere" o modificare dati reali. Aggiungere un'altra capacità
// significa aggiungere qui una nuova entry e un branch in callTool, non
// toccare il ciclo sottostante.
const TOOLS: OllamaToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'list_projects',
      description: "Restituisce l'elenco di tutti i progetti esistenti (id, nome, se attivi).",
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_tasks',
      description: 'Restituisce i task di un progetto specifico, dato il suo id.',
      parameters: {
        type: 'object',
        properties: {
          projectId: {
            type: 'string',
            description:
              "Id del progetto (preferibile) oppure il suo nome esatto se non conosci l'id: viene risolto automaticamente.",
          },
        },
        required: ['projectId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_task',
      description: 'Crea un nuovo task in un progetto esistente. Il task viene creato con stato iniziale "progress".',
      parameters: {
        type: 'object',
        properties: {
          projectId: {
            type: 'string',
            description:
              "Id del progetto (preferibile) oppure il suo nome esatto se non conosci l'id: viene risolto automaticamente.",
          },
          title: {
            type: 'string',
            description: 'Titolo del task. Non può essere vuoto.',
          },
          description: {
            type: 'string',
            description: 'Descrizione opzionale del task.',
          },
        },
        required: ['projectId', 'title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_task',
      description: 'Modifica titolo e/o descrizione di un task esistente. I campi non forniti restano invariati.',
      parameters: {
        type: 'object',
        properties: {
          projectId: {
            type: 'string',
            description:
              "Id del progetto (preferibile) oppure il suo nome esatto se non conosci l'id: viene risolto automaticamente.",
          },
          taskId: {
            type: 'string',
            description:
              "Id del task (preferibile) oppure il suo titolo esatto se non conosci l'id: viene risolto automaticamente.",
          },
          title: {
            type: 'string',
            description: 'Nuovo titolo del task. Omettere per non modificarlo.',
          },
          description: {
            type: 'string',
            description: 'Nuova descrizione del task. Omettere per non modificarla.',
          },
        },
        required: ['projectId', 'taskId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_task_status',
      description: 'Cambia lo stato di un task esistente.',
      parameters: {
        type: 'object',
        properties: {
          projectId: {
            type: 'string',
            description:
              "Id del progetto (preferibile) oppure il suo nome esatto se non conosci l'id: viene risolto automaticamente.",
          },
          taskId: {
            type: 'string',
            description:
              "Id del task (preferibile) oppure il suo titolo esatto se non conosci l'id: viene risolto automaticamente.",
          },
          status: {
            type: 'string',
            enum: TASK_STATUS_VALUES,
            description: 'Nuovo stato del task.',
          },
        },
        required: ['projectId', 'taskId', 'status'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_task',
      description: 'Elimina definitivamente un task esistente. Operazione distruttiva e irreversibile.',
      parameters: {
        type: 'object',
        properties: {
          projectId: {
            type: 'string',
            description:
              "Id del progetto (preferibile) oppure il suo nome esatto se non conosci l'id: viene risolto automaticamente.",
          },
          taskId: {
            type: 'string',
            description:
              "Id del task (preferibile) oppure il suo titolo esatto se non conosci l'id: viene risolto automaticamente.",
          },
        },
        required: ['projectId', 'taskId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'navigate_to_page',
      description:
        "Sposta l'utente su un'altra pagina dell'app cambiando ciò che vede nel browser. Usalo SOLO quando l'utente chiede esplicitamente di essere portato/spostato/mandato a una pagina (es. \"portami alla dashboard\", \"aprimi i task del progetto Hodum\"), mai per semplici domande informative su progetti o task (per quelle usa list_projects/list_tasks).",
      parameters: {
        type: 'object',
        properties: {
          page: {
            type: 'string',
            enum: ['dashboard', 'task_list'],
            description:
              '"dashboard" è la pagina con l\'elenco di tutti i progetti. "task_list" è la pagina con l\'elenco dei task di UN progetto specifico e richiede projectId.',
          },
          projectId: {
            type: 'string',
            description:
              "Obbligatorio solo con page=task_list. Id del progetto (preferibile) oppure il suo nome esatto se non conosci l'id: viene risolto automaticamente.",
          },
        },
        required: ['page'],
      },
    },
  },
];

const SYSTEM_PROMPT = `Sei l'assistente del task manager "Hodum". Rispondi sempre in italiano, in modo breve e concreto.
Non hai visibilità diretta sui dati dell'applicazione: per rispondere a qualunque domanda su progetti o task, o per crearli/modificarli/eliminarli, DEVI usare gli strumenti disponibili (list_projects, list_tasks, create_task, update_task, update_task_status, delete_task) invece di inventare informazioni o fingere di aver eseguito un'azione.
I parametri projectId e taskId accettano sia l'id reale sia, se non lo conosci con certezza, il nome del progetto o il titolo esatto del task: vengono risolti automaticamente in id. Preferisci comunque l'id quando lo hai appena ottenuto da list_projects/list_tasks in QUESTO turno; altrimenti usa direttamente il nome/titolo così come te lo ha scritto l'utente, non serve richiamare list_projects/list_tasks "per sicurezza" prima di ogni operazione.
Se una chiamata restituisce un errore "non trovato" (progetto o task), il messaggio di errore elenca già i nomi/titoli disponibili: usali per capire il problema (es. un refuso) e, se serve, chiedi conferma all'utente invece di ritentare alla cieca con lo stesso valore.
Prima di chiamare create_task, update_task o update_task_status, se l'utente non ha specificato in modo inequivocabile il progetto o il task su cui operare, chiedi prima di procedere invece di indovinare.
Prima di chiamare delete_task, che è un'operazione distruttiva e irreversibile, chiedi sempre conferma esplicita all'utente indicando titolo del task e progetto, e procedi solo dopo una conferma chiara nel messaggio successivo: a quel punto richiama delete_task con lo stesso progetto/task già indicati, senza bisogno di altre verifiche preliminari.
L'app ha solo due pagine: "dashboard" (elenco dei progetti) e "task_list" (elenco dei task di un progetto specifico, richiede il progetto). Quando l'utente chiede esplicitamente di essere portato, spostato o mandato a una di queste pagine, usa navigate_to_page: non descrivere a parole come arrivarci, spostacelo davvero. Non usarlo per rispondere a semplici domande sui dati.
Se la domanda non riguarda progetti o task, rispondi comunque in modo utile ma segnala che il tuo ambito principale è la gestione di progetti e task.`;

// Tetto alle iterazioni tool -> modello: senza, un modello che continua a
// chiedere strumenti senza mai concludere terrebbe la richiesta HTTP aperta
// indefinitamente.
const MAX_TOOL_ITERATIONS = 5;

// Alcuni modelli quantizzati, invece di popolare il campo strutturato
// tool_calls dell'API di Ollama, "perdono" la chiamata come testo nel formato
// del proprio addestramento (es. stile Hermes: <tool_call>{"name": ...,
// "arguments": {...}}</tool_call>). Qui la intercettiamo per eseguirla comunque,
// invece di mostrare quel testo grezzo all'utente come se fosse una risposta.
function extractLeakedToolCall(content: string): OllamaToolCall | null {
  const match = content.match(/\{\s*"name"\s*:\s*"([^"]+)"\s*,\s*"arguments"\s*:\s*(\{[\s\S]*?\})\s*\}/);
  if (!match) return null;
  try {
    const args = JSON.parse(match[2]) as Record<string, unknown>;
    return { function: { name: match[1], arguments: args } };
  } catch {
    return null;
  }
}

// Riconosce un tentativo di tool call fallito anche quando il JSON non è
// estraibile (troncato, malformato): meglio un messaggio di scuse esplicito
// che testo grezzo del template del modello mostrato come se fosse la risposta.
function looksLikeBrokenToolCall(content: string): boolean {
  return /<\/?tool_call>/i.test(content) || /"arguments"\s*:/.test(content);
}

// Discriminante booleano esplicito (invece di narrowing sulla verità di
// `error`, che TS non può garantire staticamente per un campo di tipo
// string): rende `id`/`error` accessibili senza cast dopo il check su `ok`.
type Resolved = { ok: true; id: string } | { ok: false; error: string };

// Il modello (soprattutto un 14B locale) non conserva in modo affidabile gli
// id ottenuti da list_projects/list_tasks in un turno precedente: la history
// che riceve è solo testo (vedi askAssistant), non i risultati strutturati
// delle tool call passate. Qui trattiamo un projectId/taskId che non è un
// uuid come un nome/titolo da risolvere al volo, invece di limitarci a
// rifiutarlo: così un'operazione riesce anche quando il modello passa
// "Hodum" o "FEAT: Task Di Test" invece del vero id.
async function resolveProjectId(idOrName: string): Promise<Resolved> {
  if (isValidUuid(idOrName)) {
    return { ok: true, id: idOrName };
  }

  const projects = await listProjects();
  const needle = idOrName.trim().toLowerCase();
  const matches = projects.filter((project) => project.name.trim().toLowerCase() === needle);

  if (matches.length === 1) {
    return { ok: true, id: matches[0].id };
  }
  if (matches.length === 0) {
    const available = projects.map((project) => project.name).join(', ') || 'nessuno';
    return { ok: false, error: `Nessun progetto trovato con nome "${idOrName}". Progetti esistenti: ${available}.` };
  }
  return { ok: false, error: `Più progetti hanno nome "${idOrName}": serve l'id esatto, richiama list_projects.` };
}

async function resolveTaskId(projectId: string, idOrTitle: string): Promise<Resolved> {
  if (isValidUuid(idOrTitle)) {
    return { ok: true, id: idOrTitle };
  }

  let tasks;
  try {
    tasks = await listTasksByProject(projectId);
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return { ok: false, error: err.message };
    }
    throw err;
  }

  const needle = idOrTitle.trim().toLowerCase();
  const matches = tasks.filter((task) => task.title.trim().toLowerCase() === needle);

  if (matches.length === 1) {
    return { ok: true, id: matches[0].id };
  }
  if (matches.length === 0) {
    const available = tasks.map((task) => task.title).join(', ') || 'nessuno';
    return {
      ok: false,
      error: `Nessun task trovato con titolo "${idOrTitle}" in questo progetto. Task esistenti: ${available}.`,
    };
  }
  return {
    ok: false,
    error: `Più task hanno titolo "${idOrTitle}" in questo progetto: serve l'id esatto, richiama list_tasks.`,
  };
}

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'list_projects':
      return listProjects();

    case 'list_tasks': {
      const projectIdArg = typeof args.projectId === 'string' ? args.projectId : undefined;
      if (!projectIdArg) {
        return { error: 'Argomento projectId mancante o non valido.' };
      }
      const project = await resolveProjectId(projectIdArg);
      if (!project.ok) return { error: project.error };
      try {
        return await listTasksByProject(project.id);
      } catch (err) {
        if (err instanceof ProjectNotFoundError) {
          return { error: err.message };
        }
        throw err;
      }
    }

    case 'create_task': {
      const projectIdArg = typeof args.projectId === 'string' ? args.projectId : undefined;
      const title = typeof args.title === 'string' ? args.title : undefined;
      const description = typeof args.description === 'string' ? args.description : undefined;
      if (!projectIdArg || !title) {
        return { error: 'Argomenti projectId e/o title mancanti o non validi.' };
      }
      if (title.trim().length === 0) {
        return { error: 'title non può essere vuoto.' };
      }
      const project = await resolveProjectId(projectIdArg);
      if (!project.ok) return { error: project.error };
      try {
        return await createTask(project.id, { title, description });
      } catch (err) {
        if (err instanceof ProjectNotFoundError) {
          return { error: err.message };
        }
        throw err;
      }
    }

    case 'update_task': {
      const projectIdArg = typeof args.projectId === 'string' ? args.projectId : undefined;
      const taskIdArg = typeof args.taskId === 'string' ? args.taskId : undefined;
      const title = typeof args.title === 'string' ? args.title : undefined;
      const description = typeof args.description === 'string' ? args.description : undefined;
      if (!projectIdArg || !taskIdArg) {
        return { error: 'Argomenti projectId e/o taskId mancanti o non validi.' };
      }
      if (title !== undefined && title.trim().length === 0) {
        return { error: 'title non può essere vuoto.' };
      }
      const project = await resolveProjectId(projectIdArg);
      if (!project.ok) return { error: project.error };
      const task = await resolveTaskId(project.id, taskIdArg);
      if (!task.ok) return { error: task.error };
      try {
        return await updateTask(project.id, task.id, { title, description });
      } catch (err) {
        if (err instanceof TaskNotFoundError) {
          return { error: err.message };
        }
        throw err;
      }
    }

    case 'update_task_status': {
      const projectIdArg = typeof args.projectId === 'string' ? args.projectId : undefined;
      const taskIdArg = typeof args.taskId === 'string' ? args.taskId : undefined;
      const status = typeof args.status === 'string' ? (args.status as TaskStatus) : undefined;
      if (!projectIdArg || !taskIdArg || !status || !TASK_STATUS_VALUES.includes(status)) {
        return { error: 'Argomenti projectId, taskId e/o status mancanti o non validi.' };
      }
      const project = await resolveProjectId(projectIdArg);
      if (!project.ok) return { error: project.error };
      const task = await resolveTaskId(project.id, taskIdArg);
      if (!task.ok) return { error: task.error };
      try {
        return await updateTaskStatus(project.id, task.id, status);
      } catch (err) {
        if (err instanceof TaskNotFoundError) {
          return { error: err.message };
        }
        throw err;
      }
    }

    case 'delete_task': {
      const projectIdArg = typeof args.projectId === 'string' ? args.projectId : undefined;
      const taskIdArg = typeof args.taskId === 'string' ? args.taskId : undefined;
      if (!projectIdArg || !taskIdArg) {
        return { error: 'Argomenti projectId e/o taskId mancanti o non validi.' };
      }
      const project = await resolveProjectId(projectIdArg);
      if (!project.ok) return { error: project.error };
      const task = await resolveTaskId(project.id, taskIdArg);
      if (!task.ok) return { error: task.error };
      try {
        await deleteTask(project.id, task.id);
        return { success: true };
      } catch (err) {
        if (err instanceof TaskNotFoundError) {
          return { error: err.message };
        }
        throw err;
      }
    }

    case 'navigate_to_page': {
      const page = typeof args.page === 'string' ? args.page : undefined;
      if (page === 'dashboard') {
        return { path: '/dashboard' };
      }
      if (page === 'task_list') {
        const projectIdArg = typeof args.projectId === 'string' ? args.projectId : undefined;
        if (!projectIdArg) {
          return { error: 'Argomento projectId mancante: necessario per aprire i task di un progetto.' };
        }
        const project = await resolveProjectId(projectIdArg);
        if (!project.ok) return { error: project.error };
        return { path: `/dashboard/${project.id}/task-list` };
      }
      return { error: `Pagina sconosciuta: ${page}. Pagine valide: dashboard, task_list.` };
    }

    default:
      // Non dovrebbe accadere (il modello sceglie solo tra i nomi dichiarati in
      // TOOLS), ma un modello quantizzato può comunque allucinare un nome:
      // rispondere con un errore testuale gli permette di correggersi al giro
      // successivo invece di far fallire l'intera richiesta.
      return { error: `Strumento sconosciuto: ${name}` };
  }
}

export interface AssistantReply {
  reply: string;
  // Path assoluto (es. "/dashboard/<id>/task-list") quando il modello ha
  // chiamato navigate_to_page con successo in questo turno: il frontend deve
  // navigarci, il backend non ha accesso al router per farlo da sé.
  navigateTo?: string;
}

export async function askAssistant(message: string, history: AssistantMessage[] = []): Promise<AssistantReply> {
  const messages: OllamaChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.map((entry) => ({ role: entry.role, content: entry.content })),
    { role: 'user', content: message },
  ];
  let navigateTo: string | undefined;

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    // Temperatura bassa: qui vogliamo un modello che segue in modo prevedibile
    // le istruzioni sul tool-calling, non risposte creative.
    const reply = await ollamaChat({
      model: MODEL,
      messages,
      tools: TOOLS,
      stream: false,
      options: { temperature: 0.2 },
    });

    const toolCalls: OllamaToolCall[] | undefined =
      reply.tool_calls && reply.tool_calls.length > 0
        ? reply.tool_calls
        : (() => {
            const leaked = extractLeakedToolCall(reply.content);
            return leaked ? [leaked] : undefined;
          })();

    // Se abbiamo recuperato una tool call "persa" nel testo, riscriviamo il
    // messaggio in forma strutturata prima di salvarlo in cronologia: così il
    // modello non rivede il proprio output rotto nei turni successivi, che lo
    // spingerebbe a ripeterlo.
    messages.push({
      role: 'assistant',
      content: toolCalls ? '' : reply.content,
      tool_calls: toolCalls,
    });

    if (!toolCalls) {
      if (looksLikeBrokenToolCall(reply.content)) {
        return { reply: 'Non sono riuscito a elaborare una risposta valida. Prova a riformulare la domanda.', navigateTo };
      }
      return { reply: reply.content, navigateTo };
    }

    // Un turno può contenere più tool_calls (es. list_tasks su due progetti
    // diversi): eseguiamo tutte le chiamate richieste prima di tornare dal
    // modello, con un messaggio "tool" di risposta per ciascuna.
    for (const call of toolCalls) {
      const result = await callTool(call.function.name, call.function.arguments ?? {});
      if (call.function.name === 'navigate_to_page' && result && typeof result === 'object' && 'path' in result) {
        const path = (result as { path?: unknown }).path;
        if (typeof path === 'string') {
          navigateTo = path;
        }
      }
      messages.push({ role: 'tool', content: JSON.stringify(result) });
    }
  }

  throw new OllamaError("L'assistente non è riuscito a produrre una risposta entro i tentativi consentiti.");
}
