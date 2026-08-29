import { ollamaChat, OllamaError } from './ollamaClient';
import type { OllamaChatMessage, OllamaToolCall, OllamaToolDefinition } from './ollamaClient';
import { getProjectById, listProjects } from './projectService';
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

// Inviato dal frontend solo quando l'utente ha attivo il toggle "contesto
// pagina" nel pannello assistente: dice al modello dove si trova l'utente
// nell'app in QUESTO turno, senza che debba specificarlo a parole (es. "il
// primo task" mentre è già sulla task-list di un progetto). Niente id di
// task: la pagina task_list non seleziona un task specifico, solo un progetto.
export type PageContext = { page: 'dashboard' } | { page: 'task_list'; projectId: string };

// Un solo modello per l'intero processo: cambiarlo è un riavvio del server
// con OLLAMA_MODEL diverso, non una modifica di codice.
// 7b invece di 14b: a parità di prompt e strumenti, nei test il 14b ha
// dichiarato più volte azioni riuscite senza che il tool corrispondente
// fosse mai stato chiamato (o dopo che aveva restituito un errore), mentre il
// 7b ha sempre ammesso l'errore o chiesto conferma quando non era certo.
// Contro-intuitivo ma verificato: qui conta l'aderenza alle istruzioni di
// tool-calling, non la dimensione del modello. Un 27b è stato scartato prima
// ancora di poter fare questo confronto: su questo hardware va in timeout
// già su un semplice saluto.
const MODEL = process.env.OLLAMA_MODEL ?? 'qwen2.5:7b';

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
      description:
        'Restituisce i task di un progetto specifico (con id, titolo, descrizione e stato attuale di ciascuno). Usalo anche per trovare un task che l\'utente identifica per stato o posizione invece che per titolo, es. "il task in review" o "il primo task": filtra tu stesso il risultato sul campo status o sull\'ordine restituito, invece di passare quella descrizione come se fosse un titolo.',
      parameters: {
        type: 'object',
        properties: {
          projectId: {
            type: 'string',
            description:
              "Id del progetto (preferibile) oppure il suo nome, anche parziale, se non conosci l'id: viene risolto automaticamente.",
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
              "Id del progetto (preferibile) oppure il suo nome, anche parziale, se non conosci l'id: viene risolto automaticamente.",
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
              "Id del progetto (preferibile) oppure il suo nome, anche parziale, se non conosci l'id: viene risolto automaticamente.",
          },
          taskId: {
            type: 'string',
            description:
              "Id del task (preferibile) oppure il suo titolo, anche parziale, se non conosci l'id: viene risolto automaticamente.",
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
              "Id del progetto (preferibile) oppure il suo nome, anche parziale, se non conosci l'id: viene risolto automaticamente.",
          },
          taskId: {
            type: 'string',
            description:
              "Id del task (preferibile) oppure il suo titolo, anche parziale, se non conosci l'id: viene risolto automaticamente.",
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
              "Id del progetto (preferibile) oppure il suo nome, anche parziale, se non conosci l'id: viene risolto automaticamente.",
          },
          taskId: {
            type: 'string',
            description:
              "Id del task (preferibile) oppure il suo titolo, anche parziale, se non conosci l'id: viene risolto automaticamente.",
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
              "Obbligatorio solo con page=task_list. Id del progetto (preferibile) oppure il suo nome, anche parziale, se non conosci l'id: viene risolto automaticamente.",
          },
        },
        required: ['page'],
      },
    },
  },
];

const SYSTEM_PROMPT = `Sei l'assistente del task manager "Hodum". Rispondi sempre in italiano, in modo breve e concreto.
Non hai visibilità diretta sui dati dell'applicazione: per rispondere a qualunque domanda su progetti o task, o per crearli/modificarli/eliminarli, DEVI usare gli strumenti disponibili (list_projects, list_tasks, create_task, update_task, update_task_status, delete_task) invece di inventare informazioni o fingere di aver eseguito un'azione.
I parametri projectId e taskId accettano sia l'id reale sia, se non lo conosci con certezza, il nome del progetto o il titolo del task anche parziali (es. "Hodum" trova "Progetto Hodum"): vengono risolti automaticamente in id. Preferisci comunque l'id quando lo hai appena ottenuto da list_projects/list_tasks in QUESTO turno; altrimenti usa direttamente il nome/titolo così come te lo ha scritto l'utente, non serve richiamare list_projects/list_tasks "per sicurezza" prima di ogni operazione.
projectId e taskId devono però essere sempre un id, un nome o un titolo reali: mai la descrizione di un criterio come lo stato ("il task in review"), la posizione ("il primo task") o simili, perché verrebbero cercati alla lettera come se fossero un titolo e fallirebbero. Quando l'utente identifica un task così, chiama prima list_tasks (list_projects se il criterio riguarda un progetto), individua tu stesso l'elemento giusto leggendo i campi restituiti (es. il campo status di ciascun task), e usa il suo id o titolo esatto nella chiamata successiva.
Se una chiamata restituisce un errore "non trovato" o "più corrispondenze" (progetto o task), il messaggio elenca già i nomi/titoli disponibili o candidati: usali per capire il problema (es. un refuso, o un nome troppo generico che corrisponde a più cose) e chiedi conferma all'utente invece di ritentare alla cieca con lo stesso valore.
Se prima del messaggio dell'utente trovi un messaggio di sistema che inizia con "Contesto:", indica in quale pagina/progetto si trova l'utente in questo momento nell'app: usalo per risolvere riferimenti impliciti (es. "sposta il primo task in review" senza nominare un progetto, mentre l'utente sta guardando la task-list di "Hodum" -> intendi quel progetto). Se però l'utente nomina esplicitamente un progetto o task diverso, quello che dice lui ha sempre la priorità su questo contesto.
Prima di chiamare create_task, update_task o update_task_status, se l'utente non ha specificato in modo inequivocabile il progetto o il task su cui operare (e il contesto pagina, se presente, non basta a risolvere l'ambiguità), chiedi UNA SOLA VOLTA i dettagli mancanti. Non appena il target è chiaro (dal messaggio dell'utente, da una risposta di chiarimento, o dal contesto pagina), esegui subito lo strumento: queste tre operazioni non sono distruttive e non richiedono un'ulteriore domanda "confermi?" prima di procedere.
Fa eccezione delete_task, l'unica operazione distruttiva e irreversibile: prima di chiamarlo chiedi sempre conferma esplicita indicando titolo del task e progetto, e procedi non appena il messaggio successivo dell'utente è chiaramente affermativo (es. "sì", "confermo", "vai", "fallo", anche con un refuso come "condermo"), senza pretendere che ripeta una parola esatta né chiedere una seconda conferma se la risposta è già inequivocabile.
Dopo aver chiamato uno strumento che modifica dati (create_task, update_task, update_task_status, delete_task), guarda il risultato prima di rispondere: se contiene un campo error l'operazione NON è riuscita, quindi riporta all'utente quell'errore invece di dire che è andata a buon fine. Dichiara un'azione completata solo subito dopo aver ricevuto, in questo stesso turno, un risultato dello strumento corrispondente senza errori: mai perché "dovrebbe" essere andata bene o perché l'hai detto in un turno precedente.
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

// L'utente umano scrive nomi/titoli a memoria, spesso parziali o approssimati
// ("Hodum" invece di "Progetto Hodum"): un match solo esatto costringeva a
// ripetere la richiesta con il nome copiato lettera per lettera. Qui si
// prova prima il match esatto (così un nome che è anche sottostringa di un
// altro resta univoco) e solo se non c'è nulla si passa alla sottostringa,
// restituendo comunque tutti i candidati per far emergere l'ambiguità.
function findByNameOrTitle<T>(items: T[], getName: (item: T) => string, needle: string): T[] {
  const normalizedNeedle = needle.trim().toLowerCase();
  const exact = items.filter((item) => getName(item).trim().toLowerCase() === normalizedNeedle);
  if (exact.length > 0) return exact;
  return items.filter((item) => getName(item).trim().toLowerCase().includes(normalizedNeedle));
}

// Il modello (soprattutto un 14B locale) non conserva in modo affidabile gli
// id ottenuti da list_projects/list_tasks in un turno precedente: la history
// che riceve è solo testo (vedi askAssistant), non i risultati strutturati
// delle tool call passate. Qui trattiamo un projectId/taskId che non è un
// uuid come un nome/titolo da risolvere al volo, invece di limitarsi a
// rifiutarlo: così un'operazione riesce anche quando il modello passa
// "Hodum" o "FEAT: Task Di Test" invece del vero id.
async function resolveProjectId(idOrName: string): Promise<Resolved> {
  const projects = await listProjects();

  if (isValidUuid(idOrName)) {
    const byId = projects.find((project) => project.id === idOrName);
    if (byId) return { ok: true, id: byId.id };
    // Id sintatticamente valido ma inesistente (allucinato dal modello, o
    // riferito a un progetto nel frattempo eliminato): niente ricerca "sia
    // per id sia per nome" in contemporanea, si passa del tutto alla ricerca
    // per nome usando lo stesso valore, che fallirà in modo pulito con
    // l'elenco dei progetti disponibili invece di un id opaco non trovato.
  }

  const matches = findByNameOrTitle(projects, (project) => project.name, idOrName);

  if (matches.length === 1) {
    return { ok: true, id: matches[0].id };
  }
  if (matches.length === 0) {
    const available = projects.map((project) => project.name).join(', ') || 'nessuno';
    return { ok: false, error: `Nessun progetto trovato con nome "${idOrName}". Progetti esistenti: ${available}.` };
  }
  const names = matches.map((project) => project.name).join(', ');
  return { ok: false, error: `Più progetti corrispondono a "${idOrName}" (${names}): specifica il nome esatto o l'id.` };
}

async function resolveTaskId(projectId: string, idOrTitle: string): Promise<Resolved> {
  let tasks;
  try {
    tasks = await listTasksByProject(projectId);
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return { ok: false, error: err.message };
    }
    throw err;
  }

  if (isValidUuid(idOrTitle)) {
    const byId = tasks.find((task) => task.id === idOrTitle);
    if (byId) return { ok: true, id: byId.id };
    // Stesso fallback di resolveProjectId: id valido ma inesistente in questo
    // progetto -> si tenta lo stesso valore come titolo invece di arrendersi.
  }

  const matches = findByNameOrTitle(tasks, (task) => task.title, idOrTitle);

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
  const titles = matches.map((task) => task.title).join(', ');
  return {
    ok: false,
    error: `Più task in questo progetto corrispondono a "${idOrTitle}" (${titles}): specifica il titolo esatto o l'id.`,
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

// Un messaggio "system" ad-hoc, non fa parte di SYSTEM_PROMPT: viene
// ricalcolato e reinserito ad ogni richiesta (mai salvato in `history`, che
// resta solo testo utente/assistente) così riflette sempre la pagina in cui
// si trova l'utente in QUESTO turno, non quella di un turno precedente.
async function buildPageContextMessage(pageContext: PageContext | undefined): Promise<OllamaChatMessage | null> {
  if (!pageContext) return null;

  if (pageContext.page === 'dashboard') {
    return {
      role: 'system',
      content: "Contesto: l'utente sta guardando la dashboard con l'elenco di tutti i progetti, non è dentro un progetto specifico in questo momento.",
    };
  }

  try {
    const project = await getProjectById(pageContext.projectId);
    return {
      role: 'system',
      content: `Contesto: l'utente sta guardando la pagina dei task del progetto "${project.name}" (id ${project.id}).`,
    };
  } catch {
    // Progetto nel frattempo rinominato/eliminato dall'id che il frontend
    // aveva in URL: meglio nessun contesto che uno fasullo o un errore che
    // interrompe la richiesta per un dettaglio secondario.
    return null;
  }
}

export async function askAssistant(
  message: string,
  history: AssistantMessage[] = [],
  pageContext?: PageContext,
): Promise<AssistantReply> {
  const messages: OllamaChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.map((entry) => ({ role: entry.role, content: entry.content })),
  ];
  const contextMessage = await buildPageContextMessage(pageContext);
  if (contextMessage) {
    messages.push(contextMessage);
  }
  messages.push({ role: 'user', content: message });
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
    const failedCalls: { name: string; error: string }[] = [];
    for (const call of toolCalls) {
      const result = await callTool(call.function.name, call.function.arguments ?? {});
      if (call.function.name === 'navigate_to_page' && result && typeof result === 'object' && 'path' in result) {
        const path = (result as { path?: unknown }).path;
        if (typeof path === 'string') {
          navigateTo = path;
        }
      }
      if (result && typeof result === 'object' && 'error' in result) {
        const error = (result as { error?: unknown }).error;
        if (typeof error === 'string') {
          failedCalls.push({ name: call.function.name, error });
        }
      }
      messages.push({ role: 'tool', content: JSON.stringify(result) });
    }

    // Il SYSTEM_PROMPT vieta già di dichiarare un'azione riuscita senza un
    // risultato senza errori, ma quell'istruzione è distante (in token) dal
    // punto in cui il modello genera la risposta finale: con un modello
    // quantizzato locale la recency conta, e in pratica capita che citi
    // l'errore e poi dichiari comunque successo. Ripetiamo il divieto qui,
    // subito dopo i risultati falliti e appena prima della prossima
    // generazione, elencando esplicitamente quali chiamate sono fallite.
    if (failedCalls.length > 0) {
      const summary = failedCalls.map((f) => `- ${f.name}: ${f.error}`).join('\n');
      messages.push({
        role: 'system',
        content: `Promemoria: le seguenti chiamate appena eseguite sono FALLITE (nessun dato è stato modificato):\n${summary}\nNella tua prossima risposta non devi dichiarare che l'azione è riuscita: riporta questi errori all'utente, oppure prova a correggerli (es. richiamando list_tasks/list_projects per trovare l'id o il titolo corretto) prima di ritentare.`,
      });
    }
  }

  throw new OllamaError("L'assistente non è riuscito a produrre una risposta entro i tentativi consentiti.");
}
