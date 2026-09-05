import type { PropsWithChildren } from "react";
import styles from "./buttonComponent.module.css";

interface Prop {
  key?: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "primary" | "danger";
  // "submit" resta il default per non toccare tutte le modali esistenti, che
  // si affidano al submit implicito del <form> di ModalBaseComponent
  // (primaryAction senza type esplicito). "button" va passato esplicitamente
  // da chi monta un ButtonComponent come azione autonoma DENTRO lo stesso
  // <form> (es. "Esporta i miei dati"/"Elimina il mio account" in
  // editAccountModalComponent): senza, il click attiverebbe anche il submit
  // del form, oltre all'onClick qui sotto.
  type?: "button" | "submit";
}
function ButtonComponent({
  children,
  onClick,
  key,
  disabled = false,
  variant = "primary",
  type = "submit",
}: PropsWithChildren<Prop>) {
  return (
    <>
      <button
        key={key || undefined}
        type={type}
        className={
          variant === "danger"
            ? `${styles.buttonBase} ${styles.buttonDanger}`
            : styles.buttonBase
        }
        onClick={onClick}
        disabled={disabled}
      >
        {children}
      </button>
    </>
  );
}

export default ButtonComponent;
