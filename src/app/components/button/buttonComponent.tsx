import type { PropsWithChildren } from "react";
import styles from "./buttonComponent.module.css";

interface Prop {
  key?: string;
  onClick: () => void;
}
function ButtonComponent({ children, onClick, key }: PropsWithChildren<Prop>) {
  return (
    <>
      <button
        key={key || undefined}
        className={styles.buttonBase}
        onClick={onClick}
      >
        {children}
      </button>
    </>
  );
}

export default ButtonComponent;
