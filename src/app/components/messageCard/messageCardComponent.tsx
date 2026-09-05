import styles from "./messageCardComponent.module.css";

interface Prop {
  title: string;
  text: string;
  // Tinge il bordo/titolo di rosso (vedi messageCard.module.css): solo per
  // un errore di caricamento, non per uno stato vuoto "normale" o un
  // "risorsa non trovata" neutro.
  variant?: "error";
  // "alert" annuncia il contenuto agli screen reader appena appare: sempre
  // insieme a variant="error", ma anche da solo per un feedback comunque
  // inatteso e non stilisticamente un errore (es. "progetto non trovato").
  role?: "alert";
}

// Card di messaggio (stato vuoto, errore di caricamento, risorsa non
// trovata): stessa struttura duplicata identica in dashboard, employees,
// invoices e taskList, tutte già allineate sullo stesso CSS condiviso
// (shared/styles/messageCard.module.css) tramite `composes` ma con il
// markup ripetuto in ognuna.
function MessageCardComponent({ title, text, variant, role }: Prop) {
  return (
    <div className={styles.messageCard} data-variant={variant} role={role}>
      <p className={styles.messageCardTitle}>{title}</p>
      <p className={styles.messageCardText}>{text}</p>
    </div>
  );
}

export default MessageCardComponent;
