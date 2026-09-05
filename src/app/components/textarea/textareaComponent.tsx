import type { ChangeEventHandler, CSSProperties, KeyboardEventHandler } from "react";
import { useId } from "react";
import styles from "./textareaComponent.module.css";

interface Prop {
  label: string;
  value?: string;
  onChange?: ChangeEventHandler<HTMLTextAreaElement>;
  // Opzionale: usato solo da chi ha bisogno di intercettare un tasto prima
  // del default del browser (es. il pannello commenti, Invio per inviare).
  onKeyDown?: KeyboardEventHandler<HTMLTextAreaElement>;
  placeholder?: string;
  name?: string;
  required?: boolean;
  autoComplete?: string;
  autoFocus?: boolean;
  error?: string;
  /** Altezza in righe visibili. Il campo non è più ridimensionabile a mano
   * dall'utente (resize disattivato): righe fisse con scroll interno, tranne
   * quando fillHeight è true. */
  rows?: number;
  /** Mostra la label sopra il campo invece di lasciarla solo per screen
   * reader (stesso significato di InputComponent.showLabel). */
  showLabel?: boolean;
  /** Invece di un'altezza fissata da "rows", il campo occupa tutto lo spazio
   * verticale disponibile nel contenitore flex che lo ospita (es. la
   * descrizione del task, stretta fra titolo e data). Richiede che il
   * genitore diretto sia un contenitore flex con un'altezza delimitata. */
  fillHeight?: boolean;
  /** Classe aggiuntiva sulla textarea nativa, per personalizzazioni puntuali
   * (es. padding extra per lasciare spazio a un pulsante interno). */
  className?: string;
  disabled?: boolean;
}

function TextareaComponent({
  label,
  value,
  onChange,
  onKeyDown,
  placeholder,
  name,
  required,
  autoComplete,
  autoFocus,
  error,
  rows = 4,
  showLabel = false,
  fillHeight = false,
  className,
  disabled = false,
}: Prop) {
  const textareaId = useId();
  const errorId = useId();
  // Il min-height di fieldBase era un valore fisso (96px) tarato sulla
  // descrizione task (rows=4): bene lì, ma sproporzionato per le textarea
  // compatte a rows=2 (composer/modifica commento), che restavano alte il
  // doppio di quanto serve. La var CSS lo rende proporzionale a "rows" (vedi
  // .textareaBase) senza toccare gli altri usi. Ignorata quando fillHeight è
  // true: lì l'altezza la decide il flex del contenitore, non le righe.
  const textareaStyle = { "--textarea-rows": rows } as CSSProperties;

  const textareaClassNames = [
    error ? styles.textareaBaseError : null,
    fillHeight ? styles.textareaBaseFill : null,
    className ?? null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={
        fillHeight
          ? `${styles.textareaWrapper} ${styles.textareaWrapperFill}`
          : styles.textareaWrapper
      }
    >
      <label
        className={showLabel ? styles.label : styles.srOnly}
        htmlFor={textareaId}
      >
        {label}
      </label>
      <textarea
        id={textareaId}
        className={`${styles.textareaBase} ${textareaClassNames}`.trim()}
        style={textareaStyle}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        name={name}
        required={required}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        disabled={disabled}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      {error && (
        <p id={errorId} role="alert" className={styles.textareaErrorMessage}>
          {error}
        </p>
      )}
    </div>
  );
}

export default TextareaComponent;
