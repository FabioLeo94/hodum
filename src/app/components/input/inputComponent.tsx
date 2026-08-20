import type { ChangeEventHandler, HTMLInputTypeAttribute } from "react";
import "./inputComponent.css";

interface Prop {
  key?: string;
  type: HTMLInputTypeAttribute;
  value?: string;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  placeholder?: string;
  name?: string;
  required?: boolean;
  autoComplete?: string;
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
  error,
}: Prop) {
  return (
    <div className="inputWrapper">
      <input
        className={error ? "inputBase inputBaseError" : "inputBase"}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        name={name}
        required={required}
        autoComplete={autoComplete}
      />
      {error && <p className="inputErrorMessage">{error}</p>}
    </div>
  );
}

export default InputComponent;
