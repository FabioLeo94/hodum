import type { ChangeEventHandler, HTMLInputTypeAttribute } from "react";
import { useId } from "react";
import styles from "./inputComponent.module.css";

interface Prop {
  type: HTMLInputTypeAttribute;
  label: string;
  value?: string;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  placeholder?: string;
  name?: string;
  required?: boolean;
  autoComplete?: string;
  autoFocus?: boolean;
  error?: string;
  /** Mostra la label sopra il campo invece di lasciarla solo per screen reader:
   * serve dove il placeholder da solo non basta a capire cosa contiene il
   * campo (es. un input date, che non mostra placeholder nativo). */
  showLabel?: boolean;
  disabled?: boolean;
}
function InputComponent({
  type,
  label,
  value,
  onChange,
  placeholder,
  name,
  required,
  autoComplete,
  autoFocus,
  error,
  showLabel = false,
  disabled = false,
}: Prop) {
  const inputId = useId();
  const errorId = useId();

  return (
    <div className={styles.inputWrapper}>
      <label
        className={showLabel ? styles.label : styles.srOnly}
        htmlFor={inputId}
      >
        {label}
      </label>
      <input
        id={inputId}
        className={
          error
            ? `${styles.inputBase} ${styles.inputBaseError}`
            : styles.inputBase
        }
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        name={name}
        required={required}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      {error && (
        <p id={errorId} role="alert" className={styles.inputErrorMessage}>
          {error}
        </p>
      )}
    </div>
  );
}

export default InputComponent;
