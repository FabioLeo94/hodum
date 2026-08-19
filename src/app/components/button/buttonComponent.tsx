import type { PropsWithChildren } from "react";
import "./buttonComponent.css";

interface Prop {
  key?: string;
  onClick: () => void;
}
function ButtonComponent({
  key = crypto.randomUUID(),
  children,
  onClick,
}: PropsWithChildren<Prop>) {
  return (
    <>
      <button className={"buttonBase"} key={key} onClick={onClick}>
        {children}
      </button>
    </>
  );
}

export default ButtonComponent;
