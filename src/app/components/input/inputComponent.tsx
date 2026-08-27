import type { ChangeEventHandler, HTMLInputTypeAttribute } from "react";
import styles from "./inputComponent.module.css";

interface Prop {
  key?: string;
  type: HTMLInputTypeAttribute;
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
  value,
  onChange,
  placeholder,
  name,
  required,
  autoComplete,
  autoFocus,
  error,
}: Prop) {
  return (
    <div className={styles.inputWrapper}>
      <input
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
      />
      {error && <p className={styles.inputErrorMessage}>{error}</p>}
    </div>
  );
}

export default InputComponent;
