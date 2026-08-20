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
}
function InputComponent({
  key = crypto.randomUUID(),
  type,
  value,
  onChange,
  placeholder,
  name,
  required,
  autoComplete,
}: Prop) {
  return (
    <input
      key={key}
      className="inputBase"
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      name={name}
      required={required}
      autoComplete={autoComplete}
    />
  );
}

export default InputComponent;
