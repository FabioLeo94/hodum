import type { HTMLInputTypeAttribute } from "react";
import "./inputComponent.css";

interface Prop {
  key?: string;
  type: HTMLInputTypeAttribute;
}
function InputComponent({ key, type }: Prop) {
  return (
    <input key={key ?? crypto.randomUUID()} className="inputBase" type={type} />
  );
}

export default InputComponent;
