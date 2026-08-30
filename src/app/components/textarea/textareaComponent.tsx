import type { ChangeEventHandler } from "react";
import { useId } from "react";
import styles from "./textareaComponent.module.css";

interface Prop {
  label: string;
  value?: string;
  onChange?: ChangeEventHandler<HTMLTextAreaElement>;
  placeholder?: string;
  name?: string;
  required?: boolean;
  autoComplete?: string;
  autoFocus?: boolean;
  error?: string;
  /** Altezza in righe visibili; il campo resta comunque ridimensionabile in verticale dall'utente. */
  rows?: number;
}

function TextareaComponent({
  label,
  value,
  onChange,
  placeholder,
  name,
  required,
  autoComplete,
  autoFocus,
  error,
  rows = 4,
}: Prop) {
  const textareaId = useId();
  const errorId = useId();

  return (
    <div className={styles.textareaWrapper}>
      <label className={styles.srOnly} htmlFor={textareaId}>
        {label}
      </label>
      <textarea
        id={textareaId}
        className={
          error
            ? `${styles.textareaBase} ${styles.textareaBaseError}`
            : styles.textareaBase
        }
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        name={name}
        required={required}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
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
