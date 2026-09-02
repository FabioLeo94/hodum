import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { TaskComment } from "../../../shared/types/project";
import {
  createTaskComment,
  deleteTaskComment,
  listTaskComments,
  updateTaskComment,
} from "../../services/project/projectService";
import { subscribeToTaskComments } from "../../services/realtime/socketService";
import { getUser } from "../../services/auth/authService";
import { formatDateTime } from "../../../shared/utils/formatDate";
import { useAsyncSubmit } from "../../../shared/hooks/useAsyncSubmit";
import TextareaComponent from "../textarea/textareaComponent";
import AvatarComponent from "../avatar/avatarComponent";
import styles from "./taskCommentsPanelComponent.module.css";

interface Prop {
  projectId: string;
  taskId: string;
}

function TaskCommentsPanelComponent({ projectId, taskId }: Prop) {
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState("");
  const { isSubmitting, submit } = useAsyncSubmit();
  // Un solo commento alla volta in modifica/eliminazione: id del commento
  // coinvolto, non un set, coerente con l'interazione (aprirne uno chiude
  // implicitamente l'altro, vedi handleStartEdit/handleStartDelete).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [editError, setEditError] = useState("");
  const { isSubmitting: isSavingEdit, submit: submitEdit } = useAsyncSubmit();
  // deletingId copre sia lo stato "armato" (countdown in corso, in attesa del
  // secondo click) sia quello "in corso" (isDeleting true): la UI le
  // distingue solo tramite isDeleting, lo scope del commento è lo stesso.
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<{ commentId: string; message: string } | null>(
    null,
  );
  const { isSubmitting: isDeleting, submit: submitDelete } = useAsyncSubmit();
  const deleteArmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Menu "altre azioni" (tre puntini): un solo commento alla volta, stesso
  // motivo di editingId/deletingId. Le Map (invece di un singolo ref) tengono
  // il nodo di ogni bolla mappata in comments.map, dato che gli hook non
  // possono essere chiamati dentro il .map: l'effect sotto pesca dalla Map
  // solo il nodo del commento effettivamente aperto.
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuContainerRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const kebabButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const firstMenuItemRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const currentUserId = getUser()?.id;

  // Nessun reset di isLoading/loadError qui: il chiamante (TaskFormModalComponent,
  // rimontato ad ogni apertura via key) garantisce che projectId/taskId non
  // cambino durante la vita di questa istanza, quindi lo stato iniziale
  // (isLoading true, loadError vuoto) basta senza un setState sincrono in effect.
  useEffect(() => {
    let cancelled = false;

    listTaskComments(projectId, taskId)
      .then((data) => {
        if (!cancelled) setComments(data);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Impossibile caricare i commenti.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, taskId]);

  // Riflette in tempo reale i commenti creati/modificati/eliminati da
  // qualunque utente (compreso me da un'altra scheda): la room del progetto è
  // già joinata da subscribeToProjectTasks (montato dalla pagina che ospita
  // questa modale), qui bastano i listener filtrati per taskId.
  useEffect(() => {
    const unsubscribe = subscribeToTaskComments(taskId, {
      onCreated: (comment) => {
        setComments((current) =>
          current.some((existing) => existing.id === comment.id)
            ? current
            : [...current, comment],
        );
      },
      onUpdated: (comment) => {
        setComments((current) =>
          current.map((existing) => (existing.id === comment.id ? comment : existing)),
        );
        // Se sto ancora modificando questo stesso commento da un'altra
        // scheda/dispositivo, chiudo il form: il body salvato lì ha ormai
        // sostituito quello che avevo in bozza qui.
        setEditingId((current) => (current === comment.id ? null : current));
      },
      onDeleted: (commentId) => {
        setComments((current) => current.filter((existing) => existing.id !== commentId));
        setEditingId((current) => (current === commentId ? null : current));
        setOpenMenuId((current) => (current === commentId ? null : current));
        setDeletingId((current) => {
          if (current !== commentId) return current;
          if (deleteArmTimeoutRef.current) {
            clearTimeout(deleteArmTimeoutRef.current);
            deleteArmTimeoutRef.current = null;
          }
          return null;
        });
      },
    });

    return unsubscribe;
  }, [taskId]);

  // Il timer del countdown vive fuori dal render (setTimeout, non stato):
  // se il pannello si smonta mentre è armato va comunque ripulito, altrimenti
  // scatterebbe un setState su un componente non più montato.
  useEffect(() => {
    return () => {
      if (deleteArmTimeoutRef.current) clearTimeout(deleteArmTimeoutRef.current);
    };
  }, []);

  // Auto-scroll in fondo ad ogni nuovo commento (mio o altrui): il socket può
  // notificare il mio stesso commento prima che la POST si risolva, ma la
  // guardia per id sopra e in handleSend evita il doppio inserimento, non il
  // doppio scroll (idempotente).
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [comments]);

  // Click-outside/Escape/focus del menu "altre azioni", stesso pattern del
  // kebab menu di projectComponent: qui pesca il nodo del commento aperto
  // dalle Map invece di un ref fisso, dato che il menu può appartenere a uno
  // qualsiasi dei commenti mappati.
  useEffect(() => {
    if (!openMenuId) return;

    firstMenuItemRef.current?.focus();

    function handlePointerDown(event: PointerEvent) {
      const container = openMenuId ? menuContainerRefs.current.get(openMenuId) : null;
      if (container && !container.contains(event.target as Node)) {
        setOpenMenuId(null);
        disarmDelete();
      }
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        const openId = openMenuId;
        setOpenMenuId(null);
        disarmDelete();
        if (openId) kebabButtonRefs.current.get(openId)?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openMenuId]);

  function toggleMenu(commentId: string) {
    // Aprire il menù di un altro commento (o richiudere il proprio) esce
    // sempre dal contesto in cui il countdown di eliminazione ha senso.
    disarmDelete();
    setOpenMenuId((current) => (current === commentId ? null : commentId));
  }

  function disarmDelete() {
    if (deleteArmTimeoutRef.current) {
      clearTimeout(deleteArmTimeoutRef.current);
      deleteArmTimeoutRef.current = null;
    }
    setDeletingId(null);
  }

  async function handleSend() {
    const trimmed = draft.trim();
    if (trimmed === "") return;

    setSendError("");
    await submit(async () => {
      try {
        const comment = await createTaskComment(projectId, taskId, trimmed);
        setComments((current) =>
          current.some((existing) => existing.id === comment.id)
            ? current
            : [...current, comment],
        );
        setDraft("");
      } catch (error) {
        setSendError(
          error instanceof Error
            ? error.message
            : "Impossibile inviare il commento.",
        );
      }
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }

  function handleStartEdit(comment: TaskComment) {
    // Chiude un'eventuale conferma di eliminazione in corso su un altro
    // commento: le due interazioni condividono lo stesso menù e non ha senso
    // restino aperte insieme.
    disarmDelete();
    setOpenMenuId(null);
    setEditError("");
    setEditingId(comment.id);
    setEditDraft(comment.body);
  }

  function handleCancelEdit() {
    setEditingId(null);
    setEditDraft("");
    setEditError("");
  }

  async function handleSaveEdit(commentId: string) {
    const trimmed = editDraft.trim();
    if (trimmed === "") return;

    setEditError("");
    await submitEdit(async () => {
      try {
        const comment = await updateTaskComment(projectId, taskId, commentId, trimmed);
        setComments((current) =>
          current.map((existing) => (existing.id === comment.id ? comment : existing)),
        );
        setEditingId(null);
        setEditDraft("");
      } catch (error) {
        setEditError(
          error instanceof Error
            ? error.message
            : "Impossibile modificare il commento.",
        );
      }
    });
  }

  function handleEditKeyDown(event: KeyboardEvent<HTMLTextAreaElement>, commentId: string) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSaveEdit(commentId);
    } else if (event.key === "Escape") {
      handleCancelEdit();
    }
  }

  // Primo click su "Elimina": arma il bottone (countdown di 5s) invece di
  // aprire un prompt separato. Il menù resta aperto: la conferma richiede un
  // secondo click sullo stesso bottone, non un'azione altrove (vedi
  // disarmDelete, chiamato da tutti i modi in cui il menù si chiude).
  function handleStartDelete(commentId: string) {
    setEditingId(null);
    setDeleteError((current) => (current?.commentId === commentId ? null : current));
    if (deleteArmTimeoutRef.current) clearTimeout(deleteArmTimeoutRef.current);
    setDeletingId(commentId);
    deleteArmTimeoutRef.current = setTimeout(() => {
      setDeletingId((current) => (current === commentId ? null : current));
      deleteArmTimeoutRef.current = null;
    }, 5000);
  }

  // Secondo click, mentre il bottone è armato: conferma davvero l'eliminazione.
  async function handleConfirmDelete(commentId: string) {
    if (deleteArmTimeoutRef.current) {
      clearTimeout(deleteArmTimeoutRef.current);
      deleteArmTimeoutRef.current = null;
    }
    setDeleteError(null);
    await submitDelete(async () => {
      try {
        await deleteTaskComment(projectId, taskId, commentId);
        setComments((current) => current.filter((existing) => existing.id !== commentId));
        setDeletingId(null);
        setOpenMenuId(null);
      } catch (error) {
        setDeletingId(null);
        setDeleteError({
          commentId,
          message:
            error instanceof Error ? error.message : "Impossibile eliminare il commento.",
        });
      }
    });
  }

  return (
    <div className={styles.panel}>
      <h3 className={styles.heading}>Commenti</h3>
      <div
        className={styles.list}
        ref={listRef}
        role="log"
        aria-live="polite"
      >
        {isLoading && (
          <p className={styles.status} role="status">
            Caricamento commenti...
          </p>
        )}
        {!isLoading && loadError && (
          <p className={styles.loadError} role="alert">
            {loadError}
          </p>
        )}
        {!isLoading && !loadError && comments.length === 0 && (
          <p className={styles.empty}>Nessun commento ancora, scrivi il primo.</p>
        )}
        {!isLoading &&
          !loadError &&
          comments.map((comment) => {
            const isOwn = comment.authorId === currentUserId;
            const isEditingThis = editingId === comment.id;
            // Distingue solo l'aspetto del bottone "Elimina" dentro il menù
            // (armato col countdown, oppure in corso): il menù stesso resta
            // aperto e la bolla non cambia layout, a differenza del vecchio
            // banner di conferma.
            const isDeleteArmed = deletingId === comment.id && !isDeleting;
            const isDeletingThis = deletingId === comment.id && isDeleting;

            return (
              <div
                key={comment.id}
                className={styles.bubble}
                data-own={isOwn}
              >
                <div className={styles.authorRow}>
                  <AvatarComponent username={comment.authorUsername} size="sm" />
                  <span className={styles.author}>{comment.authorUsername}</span>
                  {isOwn && !isEditingThis && (
                    <div
                      className={styles.kebabArea}
                      ref={(el) => {
                        if (el) menuContainerRefs.current.set(comment.id, el);
                        else menuContainerRefs.current.delete(comment.id);
                      }}
                    >
                      <button
                        ref={(el) => {
                          if (el) kebabButtonRefs.current.set(comment.id, el);
                          else kebabButtonRefs.current.delete(comment.id);
                        }}
                        type="button"
                        className={styles.kebabButton}
                        aria-label="Altre azioni per il commento"
                        aria-haspopup="menu"
                        aria-expanded={openMenuId === comment.id}
                        aria-controls={`comment-menu-${comment.id}`}
                        onClick={() => toggleMenu(comment.id)}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          width="16"
                          height="16"
                          fill="currentColor"
                          stroke="none"
                          aria-hidden="true"
                        >
                          <circle cx="12" cy="5" r="1.6" />
                          <circle cx="12" cy="12" r="1.6" />
                          <circle cx="12" cy="19" r="1.6" />
                        </svg>
                      </button>
                      {openMenuId === comment.id && (
                        <div
                          id={`comment-menu-${comment.id}`}
                          role="menu"
                          className={styles.popoverMenu}
                        >
                          <button
                            ref={firstMenuItemRef}
                            type="button"
                            role="menuitem"
                            className={styles.popoverItem}
                            onClick={() => handleStartEdit(comment)}
                          >
                            <svg
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
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                            </svg>
                            Modifica
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className={`${styles.popoverItem} ${styles.popoverItemDanger} ${
                              isDeleteArmed ? styles.popoverItemArmed : ""
                            }`}
                            aria-live="polite"
                            onClick={() =>
                              isDeleteArmed
                                ? handleConfirmDelete(comment.id)
                                : handleStartDelete(comment.id)
                            }
                            disabled={isDeletingThis}
                          >
                            {isDeleteArmed && (
                              <span className={styles.deleteCountdownBar} aria-hidden="true" />
                            )}
                            <svg
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
                              <path d="M3 6h18" />
                              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                              <path d="M10 11v6" />
                              <path d="M14 11v6" />
                            </svg>
                            {isDeletingThis
                              ? "Eliminazione..."
                              : isDeleteArmed
                                ? "Confermi?"
                                : "Elimina"}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {isEditingThis ? (
                  <div className={styles.editForm}>
                    <TextareaComponent
                      label="Modifica il commento"
                      value={editDraft}
                      onChange={(event) => setEditDraft(event.target.value)}
                      onKeyDown={(event) => handleEditKeyDown(event, comment.id)}
                      rows={2}
                      autoFocus
                    />
                    <div className={styles.editActions}>
                      <button
                        type="button"
                        className={styles.editCancelButton}
                        onClick={handleCancelEdit}
                        disabled={isSavingEdit}
                      >
                        Annulla
                      </button>
                      <button
                        type="button"
                        className={styles.editSaveButton}
                        onClick={() => handleSaveEdit(comment.id)}
                        disabled={isSavingEdit || editDraft.trim() === ""}
                      >
                        {isSavingEdit ? "Salvataggio..." : "Salva"}
                      </button>
                    </div>
                    {editError && (
                      <p role="alert" className={styles.actionError}>
                        {editError}
                      </p>
                    )}
                  </div>
                ) : (
                  <>
                    <div className={styles.bodyWrapper}>
                      <p className={styles.body}>{comment.body}</p>
                    </div>
                    <span className={styles.timestamp}>
                      {formatDateTime(comment.createdAt)}
                      {comment.edited && (
                        <span className={styles.editedFlag}> (modificato)</span>
                      )}
                    </span>
                  </>
                )}
                {deleteError?.commentId === comment.id && (
                  <p role="alert" className={styles.actionError}>
                    {deleteError.message}
                  </p>
                )}
              </div>
            );
          })}
      </div>
      <div className={styles.composer}>
        <TextareaComponent
          label="Scrivi un commento"
          placeholder="Scrivi un commento... (Invio per inviare, Maiusc+Invio per andare a capo)"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          className={styles.composerTextarea}
        />
        <button
          type="button"
          className={styles.sendButton}
          aria-label={isSubmitting ? "Invio in corso" : "Invia commento"}
          onClick={handleSend}
          disabled={isSubmitting || draft.trim() === ""}
        >
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
      {sendError && (
        <p role="alert" className={styles.sendError}>
          {sendError}
        </p>
      )}
    </div>
  );
}

export default TaskCommentsPanelComponent;
