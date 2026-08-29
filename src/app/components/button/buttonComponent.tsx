import type { PropsWithChildren } from "react";
import styles from "./buttonComponent.module.css";

interface Prop {
  key?: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "primary" | "danger";
}
function ButtonComponent({
  children,
  onClick,
  key,
  disabled = false,
  variant = "primary",
}: PropsWithChildren<Prop>) {
  return (
    <>
      <button
        key={key || undefined}
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
