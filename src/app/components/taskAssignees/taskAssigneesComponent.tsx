import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { User } from "../../services/auth/authService";
import { getDisplayName } from "../../../shared/utils/displayName";
import AvatarComponent from "../avatar/avatarComponent";
import styles from "./taskAssigneesComponent.module.css";

const MAX_VISIBLE_AVATARS = 3;

// Confronto come insieme (ordine irrilevante): evita un onChange a vuoto
// quando pendingIds contiene esattamente gli stessi id di selectedIds, solo
// in un ordine diverso (es. toggle di andata e ritorno con shift).
function sameIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((id) => setB.has(id));
}

interface Prop {
  employees: User[];
  selectedIds: string[];
  taskTitle: string;
  onChange: (userIds: string[]) => void | Promise<void>;
  disabled?: boolean;
}

// Trigger "+" tratteggiato + dropdown in portal, stesso pattern di
// NotificationBellComponent (ref su trigger/pannello, dismiss via pointerdown
// globale + Escape, riposizionamento in useLayoutEffect ancorato al trigger).
// Nessuna chiamata di rete qui: onChange è l'unico punto di scrittura, il
// chiamante decide se persistere subito o solo tenere stato locale.
function TaskAssigneesComponent({
  employees,
  selectedIds,
  taskTitle,
  onChange,
  disabled = false,
}: Prop) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  // Inizializzato da selectedIds solo all'apertura (vedi handleTriggerClick):
  // mentre il dropdown resta aperto per più toggle in shift, non deve essere
  // ricalcolato da un selectedIds che nel frattempo potrebbe cambiare da fuori.
  const [pendingIds, setPendingIds] = useState<string[]>(selectedIds);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Letto solo in un effect (mai durante il render, vietato per i ref): vedi
  // il commento sul portal più sotto per il perché di document.body vs
  // dialog[open].
  const [portalContainer, setPortalContainer] = useState<Element | null>(null);

  // useCallback (non una function declaration semplice) perché è una
  // dipendenza dell'effect di dismiss sotto: identità stabile finché
  // selectedIds/onChange non cambiano, invece di forzare quell'effect a
  // ricrearsi ad ogni render.
  const commitAndClose = useCallback(
    (nextIds: string[]) => {
      setIsOpen(false);
      if (!sameIds(nextIds, selectedIds)) {
        onChange(nextIds);
      }
    },
    [selectedIds, onChange],
  );

  function handleTriggerClick() {
    if (disabled) return;
    setPendingIds(selectedIds);
    setIsOpen(true);
  }

  function handleOptionClick(userId: string, event: { shiftKey: boolean }) {
    const nextIds = pendingIds.includes(userId)
      ? pendingIds.filter((id) => id !== userId)
      : [...pendingIds, userId];
    setPendingIds(nextIds);
    if (!event.shiftKey) {
      commitAndClose(nextIds);
    }
  }

  // Stesso pattern di dismiss di NotificationBellComponent: il pannello vive
  // in un portal, quindi un click "dentro" va riconosciuto anche lì, non
  // solo dentro triggerRef. selectedIds/pendingIds in dipendenza: chiudere
  // ricrea i listener con i valori correnti, evitando una commit basata su
  // una closure stantia se l'utente concatena più toggle in shift.
  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return;
      }
      commitAndClose(pendingIds);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        commitAndClose(pendingIds);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, pendingIds, commitAndClose]);

  // Calcola il contenitore del portal in un effect, non durante il render:
  // leggere triggerRef.current nel corpo del JSX è vietato dalle regole di
  // React sui ref. Vedi il commento sul portal più sotto per il perché
  // di document.body vs dialog[open].
  useLayoutEffect(() => {
    if (!isOpen) return;
    setPortalContainer(triggerRef.current?.closest("dialog[open]") ?? document.body);
  }, [isOpen]);

  // Riposizionamento ancorato al trigger, stesso motivo di panelRef in
  // NotificationBellComponent: il pannello vive fuori dal flusso del suo
  // trigger (portal su document.body).
  useLayoutEffect(() => {
    if (!isOpen) return;

    function reposition() {
      const trigger = triggerRef.current;
      const panel = panelRef.current;
      if (!trigger || !panel) return;
      const rect = trigger.getBoundingClientRect();
      panel.style.top = `${rect.bottom + 8}px`;
      panel.style.left = `${rect.left}px`;
    }

    reposition();
    window.addEventListener("resize", reposition);
    return () => window.removeEventListener("resize", reposition);
  }, [isOpen]);

  const visibleAssignees = selectedIds
    .map((id) => employees.find((employee) => employee.id === id))
    .filter((employee): employee is User => employee !== undefined);
  const shownAssignees = visibleAssignees.slice(0, MAX_VISIBLE_AVATARS);
  const overflowCount = visibleAssignees.length - shownAssignees.length;

  return (
    <div className={styles.taskAssignees}>
      {shownAssignees.map((employee) => (
        <AvatarComponent key={employee.id} displayName={getDisplayName(employee)} size="sm" />
      ))}
      {overflowCount > 0 && (
        <span className={styles.overflowBadge}>{`+${overflowCount}`}</span>
      )}
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={t("components.taskAssignees.triggerLabel", { taskTitle })}
        disabled={disabled}
        onClick={handleTriggerClick}
      >
        +
      </button>

      {isOpen &&
        portalContainer &&
        createPortal(
          <div
            ref={panelRef}
            role="listbox"
            aria-multiselectable="true"
            aria-label={t("components.taskAssignees.panelLabel", { taskTitle })}
            className={styles.panel}
          >
            {employees.length === 0 ? (
              <p className={styles.status}>{t("components.taskAssignees.noEmployees")}</p>
            ) : (
              employees.map((employee) => {
                const isSelected = pendingIds.includes(employee.id);
                // Calcolato una sola volta per employee (invece che ad ogni
                // punto in cui serve, sotto): getDisplayName è pura ma non
                // c'è motivo di richiamarla tre volte sullo stesso employee.
                const employeeDisplayName = getDisplayName(employee);
                return (
                  <button
                    key={employee.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    data-selected={isSelected}
                    className={styles.option}
                    onClick={(event) => handleOptionClick(employee.id, event)}
                  >
                    <AvatarComponent displayName={employeeDisplayName} size="sm" />
                    <span className={styles.optionLabel} title={employeeDisplayName}>
                      {employeeDisplayName}
                    </span>
                  </button>
                );
              })
            )}
          </div>,
          // Un <dialog> aperto con showModal() (ModalBaseComponent, usato dalla
          // modale di creazione task) vive nel "top layer" del browser: un
          // portal su document.body finirebbe comunque sotto di esso, sia
          // visivamente sia ai fini del pointer-hit-testing, indipendentemente
          // da z-index. Se il trigger è dentro un <dialog> aperto, il portal
          // va dentro quello stesso <dialog> (stesso top layer, quindi sopra
          // il suo contenuto); altrimenti (card in lista/kanban, nessun
          // <dialog> antenato) resta su document.body come prima. Calcolato
          // nell'effect sopra (portalContainer), non qui, perché leggere
          // triggerRef.current durante il render è vietato per i ref.
          portalContainer,
        )}
    </div>
  );
}

export default TaskAssigneesComponent;
