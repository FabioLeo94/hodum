import type { PropsWithChildren } from "react";
import styles from "./buttonComponent.module.css";

interface Prop {
  key?: string;
  onClick: () => void;
  disabled?: boolean;
}
function ButtonComponent({
  children,
  onClick,
  key,
  disabled = false,
}: PropsWithChildren<Prop>) {
  return (
    <>
      <button
        key={key || undefined}
        className={styles.buttonBase}
        onClick={onClick}
        disabled={disabled}
      >
        {children}
      </button>
    </>
  );
}

export default ButtonComponent;
