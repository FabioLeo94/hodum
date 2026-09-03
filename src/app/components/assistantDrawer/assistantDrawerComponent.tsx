import { useEffect, useId, useRef, useState } from "react";
import type { SubmitEvent } from "react";
import { useLocation, useNavigate } from "react-router";
import { sendAssistantMessage } from "../../services/assistant/assistantService";
import type { AssistantMessage, PageContext } from "../../services/assistant/assistantService";
import { getProjectName } from "../../services/project/projectService";
import styles from "./assistantDrawerComponent.module.css";

// Le uniche due pagine protette esistenti (vedi App.tsx): questo componente è
// montato solo dentro ProtectedLayoutComponent, quindi il pathname corrente
// combacia sempre con una delle due.
const TASK_LIST_PATH_PATTERN = /^\/dashboard\/([^/]+)\/task-list\/?$/;

function derivePageContext(pathname: string): PageContext | null {
  const taskListMatch = pathname.match(TASK_LIST_PATH_PATTERN);
  if (taskListMatch) {
    return { page: "task_list", projectId: taskListMatch[1] };
  }
  if (pathname.startsWith("/dashboard")) {
    return { page: "dashboard" };
  }
  return null;
}

const CONTEXT_PREFERENCE_KEY = "assistant.contextEnabled";

// localStorage può non essere disponibile (privacy mode, contesti di test):
// un default sensato (attivo) evita che l'assenza del valore salvato rompa
// il rendering.
function readContextPreference(): boolean {
  try {
    const stored = localStorage.getItem(CONTEXT_PREFERENCE_KEY);
    return stored === null ? true : stored === "true";
  } catch {
    return true;
  }
}

// Id locale solo per la key di React: non fa parte del contratto con il
// backend (vedi AssistantMessage in assistantService.ts), che riceve la
// cronologia come { role, content } puri.
interface ChatEntry extends AssistantMessage {
  id: string;
}

interface Prop {
  isOpen: boolean;
  // Quando la pagina corrente non ha un FAB "+" locale (es. la dashboard vista
  // da un dipendente, che non può creare progetti), il pulsante scivola nello
  // spazio che il FAB avrebbe occupato invece di lasciarlo vuoto.
  hasLocalFab: boolean;
  onToggle: () => void;
}

// Sotto questa distanza (in px) dal fondo si considera l'utente "in fondo
// alla chat": nuovi messaggi possono continuare a scrollare in automatico.
const BOTTOM_THRESHOLD_PX = 24;

// Montato una sola volta da ProtectedLayoutComponent, fuori dall'Outlet: la
// conversazione (messages, input) sopravvive alla navigazione tra pagine,
// che invece rimonta solo il contenuto dell'Outlet.
function AssistantDrawerComponent({ isOpen, hasLocalFab, onToggle }: Prop) {
  const panelId = useId();
  const navigate = useNavigate();
  const location = useLocation();
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const [isContextEnabled, setIsContextEnabled] = useState(readContextPreference);
  // Tenuto insieme all'id a cui si riferisce: evita di mostrare per un attimo
  // il nome del progetto precedente quando l'utente naviga da un progetto a
  // un altro (vedi il confronto in projectName più sotto).
  const [resolvedProject, setResolvedProject] = useState<{ id: string; name: string | undefined } | undefined>(
    undefined,
  );

  const pageContext = derivePageContext(location.pathname);
  const contextProjectId = pageContext?.page === "task_list" ? pageContext.projectId : undefined;

  useEffect(() => {
    try {
      localStorage.setItem(CONTEXT_PREFERENCE_KEY, String(isContextEnabled));
    } catch {
      // Preferenza non persistita (localStorage non disponibile): resta
      // comunque valida per la sessione corrente in memoria.
    }
  }, [isContextEnabled]);

  // Solo per l'etichetta del toggle: il backend risolve comunque il nome dal
  // projectId ricevuto, questa fetch serve solo a mostrarlo qui prima di inviare.
  useEffect(() => {
    if (!contextProjectId) return;
    let cancelled = false;
    getProjectName(contextProjectId)
      .then((name) => {
        if (!cancelled) setResolvedProject({ id: contextProjectId, name });
      })
      .catch(() => {
        if (!cancelled) setResolvedProject({ id: contextProjectId, name: undefined });
      });
    return () => {
      cancelled = true;
    };
  }, [contextProjectId]);

  const projectName =
    resolvedProject && resolvedProject.id === contextProjectId ? resolvedProject.name : undefined;

  const contextLabel =
    pageContext?.page === "dashboard"
      ? "Dashboard"
      : pageContext?.page === "task_list"
        ? (projectName ?? "Progetto")
        : null;

  const messageListRef = useRef<HTMLDivElement>(null);
  // Rispecchia se l'utente è già in fondo alla chat: letto (non come dep)
  // dall'effetto di autoscroll per decidere se seguire i nuovi messaggi.
  const isAtBottomRef = useRef(true);
  // Forza lo scroll al fondo al prossimo effetto, a prescindere dalla
  // posizione corrente: usato solo quando è l'utente stesso a inviare.
  const forceScrollRef = useRef(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const toggleButtonRef = useRef<HTMLButtonElement>(null);
  const composerInputRef = useRef<HTMLInputElement>(null);

  // role="dialog" implica lo stesso contratto tastiera dei popover della
  // topbar (focus iniziale dentro, Escape chiude e restituisce il focus al
  // trigger): a differenza di quelli il pannello resta montato (inert quando
  // chiuso), quindi qui l'effetto si aggancia a isOpen invece che al mount.
  useEffect(() => {
    if (!isOpen) return;

    composerInputRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onToggle();
        toggleButtonRef.current?.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onToggle]);

  function handleClearHistory() {
    setMessages([]);
    setError("");
  }

  function handleScroll() {
    const el = messageListRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distanceFromBottom < BOTTOM_THRESHOLD_PX;
    isAtBottomRef.current = atBottom;
    setShowScrollButton(!atBottom);
  }

  function handleScrollToBottom() {
    const el = messageListRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    isAtBottomRef.current = true;
    setShowScrollButton(false);
  }

  // L'arrivo di nuovi messaggi segue automaticamente lo scroll solo se
  // l'utente era già in fondo (o se il messaggio è appena stato inviato da
  // lui); se sta leggendo più in alto, la posizione non viene toccata.
  useEffect(() => {
    const el = messageListRef.current;
    if (!el) return;
    if (forceScrollRef.current || isAtBottomRef.current) {
      el.scrollTo({
        top: el.scrollHeight,
        behavior: forceScrollRef.current ? "auto" : "smooth",
      });
      forceScrollRef.current = false;
      isAtBottomRef.current = true;
      setShowScrollButton(false);
    }
  }, [messages]);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isSending) return;

    const history = messages.map(({ role, content }) => ({ role, content }));
    const userEntry: ChatEntry = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
    };
    forceScrollRef.current = true;
    setMessages((current) => [...current, userEntry]);
    setInput("");
    setError("");
    setIsSending(true);

    try {
      const result = await sendAssistantMessage(
        trimmed,
        history,
        isContextEnabled && pageContext ? pageContext : undefined,
      );
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "assistant", content: result.reply },
      ]);
      if (result.navigateTo) {
        navigate(result.navigateTo);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Impossibile contattare l'assistente.",
      );
    } finally {
      setIsSending(false);
    }
  }

  return (
    <>
      <button
        ref={toggleButtonRef}
        type="button"
        className={styles.toggleButton}
        data-has-local-fab={hasLocalFab}
        aria-label={isOpen ? "Chiudi l'assistente" : "Apri l'assistente"}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <svg
          className={styles.toggleIcon}
          viewBox="0 0 24 24"
          width="24"
          height="24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4.5V16H6.5A2.5 2.5 0 0 1 4 13.5v-8Z" />
        </svg>
      </button>

      {/* inert quando chiuso: fuori schermo (transform), non focalizzabile né
          annunciato dallo screen reader finché non viene riaperto. */}
      <aside
        id={panelId}
        className={styles.panel}
        data-open={isOpen}
        inert={!isOpen}
        role="dialog"
        aria-label="Assistente"
      >
        <header className={styles.header}>
          <div className={styles.headerRow}>
            <h2 className={styles.title}>Assistente</h2>
            <button
              type="button"
              className={styles.clearButton}
              onClick={handleClearHistory}
              disabled={messages.length === 0 || isSending}
            >
              Ripulisci cronologia
            </button>
          </div>
          <p className={styles.subtitle}>
            Chiedi informazioni sui tuoi progetti e sui task.
          </p>
          {pageContext && (
            <button
              type="button"
              className={styles.contextToggle}
              aria-pressed={isContextEnabled}
              onClick={() => setIsContextEnabled((current) => !current)}
              title={
                isContextEnabled
                  ? `I messaggi includono dove ti trovi ora (${contextLabel}): l'assistente lo usa quando non nomini un progetto o un task esplicitamente.`
                  : "I messaggi non includono la pagina in cui ti trovi: dovrai nominare esplicitamente progetto e task."
              }
            >
              <svg
                className={styles.contextIcon}
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11Z" />
                <circle cx="12" cy="10" r="2.5" />
              </svg>
              {isContextEnabled ? `Contesto: ${contextLabel}` : "Contesto disattivato"}
            </button>
          )}
        </header>

        <div className={styles.messageListWrapper}>
          <div
            className={styles.messageList}
            data-empty={messages.length === 0}
            role="log"
            aria-live="polite"
            ref={messageListRef}
            onScroll={handleScroll}
          >
            {messages.length === 0 ? (
              <p className={styles.emptyState}>
                Fai una domanda per iniziare, ad esempio "Quali progetti sono
                attivi?".
              </p>
            ) : (
              messages.map((entry) => (
                <div
                  key={entry.id}
                  className={`${styles.messageBubble} ${
                    entry.role === "user"
                      ? styles.messageUser
                      : styles.messageAssistant
                  }`}
                >
                  {entry.content}
                </div>
              ))
            )}
            {isSending && (
              <div
                className={`${styles.messageBubble} ${styles.messageAssistant} ${styles.messageTyping}`}
                role="status"
              >
                <span className={styles.typingLabel}>Sto scrivendo</span>
                <span className={styles.typingDots} aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
              </div>
            )}
          </div>

          {showScrollButton && (
            <button
              type="button"
              className={styles.scrollToBottomButton}
              onClick={handleScrollToBottom}
              aria-label="Torna al messaggio più recente"
            >
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 4v16M6 14l6 6 6-6" />
              </svg>
            </button>
          )}
        </div>

        {error && (
          <p role="alert" className={styles.errorBanner}>
            {error}
          </p>
        )}

        <form className={styles.composer} onSubmit={handleSubmit}>
          <input
            ref={composerInputRef}
            className={styles.composerInput}
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Scrivi un messaggio..."
            aria-label="Messaggio per l'assistente"
            disabled={isSending}
          />
          <button
            type="submit"
            className={styles.sendButton}
            disabled={isSending || input.trim().length === 0}
          >
            Invia
          </button>
        </form>
      </aside>
    </>
  );
}

export default AssistantDrawerComponent;
