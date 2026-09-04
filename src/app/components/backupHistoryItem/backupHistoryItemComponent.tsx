import { useId, useLayoutEffect, useRef, useState } from "react";
import { Check, EllipsisVertical } from "lucide-react";
import type { BackupRecord } from "../../services/backup/backupService";
import { formatDateTime } from "../../../shared/utils/formatDate";
import styles from "./backupHistoryItemComponent.module.css";

interface Prop {
  backup: BackupRecord;
  selected: boolean;
  onToggleSelect: (backup: BackupRecord) => void;
  onRequestRestore: (backup: BackupRecord) => void;
  onRequestDelete: (backup: BackupRecord) => void;
}

// Stessa formattazione locale di BackupSettingsDrawerComponent (unico altro
// consumatore): non condivisa in shared/utils perché nessun terzo punto della
// UI mostra ancora una dimensione file.
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

const TRIGGER_LABELS: Record<BackupRecord["triggeredBy"], string> = {
  manual: "Manuale",
  scheduled: "Automatico",
  "pre-restore": "Pre-ripristino",
};

// Stesso pattern kebab + popover di ProjectComponent (menu, focus management,
// chiusura su click esterno/Escape): estratto in un componente a sé perché
// ogni voce dello storico ha bisogno del proprio stato "menu aperto",
// impossibile da tenere con degli hook dentro una .map() nel componente
// padre.
function BackupHistoryItemComponent({ backup, selected, onToggleSelect, onRequestRestore, onRequestDelete }: Prop) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const menuId = useId();
  const kebabContainerRef = useRef<HTMLDivElement>(null);
  const kebabButtonRef = useRef<HTMLButtonElement>(null);
  const firstMenuItemRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Il popover si apre di default verso il basso, ma per le ultime voci
  // dello storico questo lo spinge oltre il fondo della viewport: il drawer
  // è scrollabile e alto quanto il viewport (100vh), quindi "oltre il
  // fondo" significa dover scrollare per vedere le ultime voci del menu.
  // useLayoutEffect (non useEffect) per misurare e decidere la direzione
  // prima del paint, evitando un flash del menu nella posizione sbagliata.
  useLayoutEffect(() => {
    if (!isMenuOpen) {
      setOpenUpward(false);
      return;
    }

    const buttonRect = kebabButtonRef.current?.getBoundingClientRect();
    const menuHeight = popoverRef.current?.offsetHeight ?? 0;
    if (buttonRect) {
      setOpenUpward(buttonRect.bottom + menuHeight > window.innerHeight);
    }

    firstMenuItemRef.current?.focus();

    function handlePointerDown(event: PointerEvent) {
      if (kebabContainerRef.current && !kebabContainerRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
        kebabButtonRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMenuOpen]);

  function handleRestoreClick() {
    setIsMenuOpen(false);
    onRequestRestore(backup);
  }

  function handleDeleteClick() {
    setIsMenuOpen(false);
    onRequestDelete(backup);
  }

  return (
    <li className={styles.historyItem} data-selected={selected}>
      <button
        type="button"
        className={styles.selectToggle}
        aria-pressed={selected}
        aria-label={`${selected ? "Deseleziona" : "Seleziona"} il backup ${backup.filename}`}
        onClick={() => onToggleSelect(backup)}
      >
        <span className={styles.checkbox} aria-hidden="true">
          {selected && <Check size={12} strokeWidth={3} />}
        </span>
        <div className={styles.historyMain}>
          <span className={styles.historyFilename} title={backup.filename}>
            {backup.filename}
          </span>
          <span className={styles.historyMeta}>
            {formatDateTime(backup.createdAt)} · {formatFileSize(backup.sizeBytes)}
          </span>
        </div>
        <span className={styles.historyBadge} data-trigger={backup.triggeredBy}>
          {TRIGGER_LABELS[backup.triggeredBy]}
        </span>
      </button>
      <div className={styles.kebabArea} ref={kebabContainerRef}>
        <button
          ref={kebabButtonRef}
          type="button"
          className={styles.kebabButton}
          aria-label={`Altre azioni per ${backup.filename}`}
          aria-haspopup="menu"
          aria-expanded={isMenuOpen}
          aria-controls={menuId}
          onClick={() => setIsMenuOpen((current) => !current)}
        >
          <EllipsisVertical size={16} aria-hidden="true" />
        </button>
        {isMenuOpen && (
          <div
            id={menuId}
            role="menu"
            ref={popoverRef}
            className={styles.popoverMenu}
            data-placement={openUpward ? "up" : "down"}
          >
            <button
              ref={firstMenuItemRef}
              type="button"
              role="menuitem"
              className={styles.popoverItem}
              onClick={handleRestoreClick}
            >
              Applica
            </button>
            <button
              type="button"
              role="menuitem"
              className={styles.popoverItemDanger}
              onClick={handleDeleteClick}
            >
              Elimina
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

export default BackupHistoryItemComponent;
