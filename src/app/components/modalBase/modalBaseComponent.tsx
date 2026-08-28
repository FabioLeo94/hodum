import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import styles from "./modalBaseComponent.module.css";

interface Prop {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  variant?: "generic" | "error" | "info" | "success";
  showCloseButton?: boolean;
  primaryAction: ReactNode;
  secondaryActions?: ReactNode;
  onSubmit?: () => void;
  children: ReactNode;
}

function ModalBaseComponent({
  isOpen,
  onClose,
  title,
  variant = "generic",
  showCloseButton = true,
  primaryAction,
  secondaryActions,
  onSubmit,
  children,
}: Prop) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  const body = (
    <>
      <div className={styles.content}>{children}</div>
      <div className={styles.bottomBar}>
        {secondaryActions}
        {primaryAction}
      </div>
    </>
  );

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className={styles.dialogBase}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className={styles.topBar} data-variant={variant}>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        {showCloseButton && (
          <button
            type="button"
            className={styles.closeButton}
            aria-label="Chiudi"
            onClick={onClose}
          >
            <span aria-hidden="true">&times;</span>
          </button>
        )}
      </div>
      {onSubmit ? (
        <form
          className={styles.form}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          {body}
        </form>
      ) : (
        body
      )}
    </dialog>
  );
}

export default ModalBaseComponent;
