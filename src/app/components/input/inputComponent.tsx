import type { ChangeEventHandler, HTMLInputTypeAttribute } from "react";
import { useId } from "react";
import styles from "./inputComponent.module.css";

interface Prop {
  key?: string;
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
}: Prop) {
  const inputId = useId();
  const errorId = useId();

  return (
    <div className={styles.inputWrapper}>
      <label className={styles.srOnly} htmlFor={inputId}>
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
