import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import styles from "./drawerBaseComponent.module.css";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface Prop {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  closeLabel: string;
  // "wide" ospita contenuti più larghi (es. la tabella task fatturabili di
  // generateInvoiceDrawer): la larghezza resta gestita nel CSS module.
  size?: "default" | "wide";
  // "content" lascia il figlio gestire il proprio scroll interno (es. le due
  // viste scorrevoli a scomparsa di CustomersDrawerComponent, dove il panel
  // deve restare overflow:hidden per non rivelare il pannello nascosto).
  // "panel" fa scorrere l'intero pannello verticalmente: per drawer a vista
  // singola senza un proprio contenitore scrollabile interno.
  scrollMode?: "content" | "panel";
  // Sovrascrive la chiusura su Escape (es. CustomersDrawerComponent torna
  // alla vista lista invece di chiudere l'intero drawer). Di default chiude.
  onEscape?: () => void;
  // Disattiva sia Escape sia il focus trap qui sotto: usato quando una modale
  // figlia (<dialog> nativo, via ModalBaseComponent) è aperta sopra il
  // drawer e gestisce entrambi per conto proprio. Senza questa guardia i due
  // gestori a livello di document finirebbero in conflitto: Escape
  // chiuderebbe anche il drawer sottostante invece della sola modale, e Tab
  // verrebbe intrappolato nel drawer invece che nella modale in primo piano.
  disableEscape?: boolean;
  children: ReactNode;
}

// Shell condivisa dai drawer a pannello laterale (backdrop cliccabile,
// intestazione con titolo e bottone di chiusura, gestione di Escape e del
// focus): la stessa struttura era duplicata verbatim in generateInvoiceDrawer,
// customersDrawer, editCompanyDrawer e backupSettingsDrawer. Non copre
// assistantDrawerComponent, che è un pannello persistente sempre montato
// (inert, non backdrop-modale) con un contratto tastiera diverso.
function DrawerBaseComponent({
  isOpen,
  onClose,
  title,
  closeLabel,
  size = "default",
  scrollMode = "content",
  onEscape,
  disableEscape = false,
  children,
}: Prop) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  // Niente <dialog>/showModal come ModalBaseComponent: questi pannelli restano
  // montati e visibili durante l'animazione di chiusura (transform via
  // data-open), cosa che il display:none imposto dallo user agent a un
  // <dialog> non aperto impedirebbe. Il contratto tastiera va quindi
  // rifatto a mano.

  // Focus dentro il pannello all'apertura, ripristinato sul trigger alla
  // chiusura: agganciato al solo isOpen (non a disableEscape, vedi l'effetto
  // sotto) perché l'apertura/chiusura di una modale figlia sopra il drawer
  // non deve far scattare un ripristino intermedio del focus sul trigger
  // originale mentre il drawer stesso resta visivamente aperto.
  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const firstFocusable = panel?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (firstFocusable ?? panel)?.focus();

    return () => {
      previouslyFocused?.focus();
    };
  }, [isOpen]);

  // Escape e Tab-trap, sospesi mentre una modale figlia (<dialog> nativo) è
  // aperta sopra il drawer e gestisce entrambi per conto proprio: senza
  // questa guardia i due gestori a livello di document finirebbero in
  // conflitto, con Escape che chiude anche il drawer sottostante invece
  // della sola modale, e Tab intrappolato qui invece che nella modale in
  // primo piano.
  useEffect(() => {
    if (!isOpen || disableEscape) return;
    const panel = panelRef.current;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        (onEscape ?? onClose)();
        return;
      }
      if (event.key !== "Tab" || !panel) return;

      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, disableEscape, onEscape, onClose]);

  return (
    <>
      {isOpen && <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />}
      <div
        ref={panelRef}
        className={styles.panel}
        data-open={isOpen}
        data-size={size}
        data-scroll={scrollMode}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <button type="button" className={styles.closeButton} aria-label={closeLabel} onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </>
  );
}

export default DrawerBaseComponent;
