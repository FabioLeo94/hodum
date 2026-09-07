import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import styles from "./modalBaseComponent.module.css";

interface Prop {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  variant?: "generic" | "error" | "info" | "success";
  // "medium" ospita form con campi affiancati a coppie (es. editAccountModal,
  // editEmployeeModal); "wide" ospita layout a due colonne (es. modifica task
  // + pannello commenti). La larghezza resta gestita nel CSS module, qui solo
  // la scelta.
  size?: "default" | "medium" | "wide";
  showCloseButton?: boolean;
  primaryAction: ReactNode;
  secondaryActions?: ReactNode;
  // Azione secondaria isolata all'estremo opposto della bottom bar rispetto a
  // secondaryActions/primaryAction (es. "Esporta i miei dati"): assente,
  // la bottom bar resta allineata a destra come prima.
  leadingAction?: ReactNode;
  onSubmit?: () => void;
  children: ReactNode;
}

function ModalBaseComponent({
  isOpen,
  onClose,
  title,
  variant = "generic",
  size = "default",
  showCloseButton = true,
  primaryAction,
  secondaryActions,
  leadingAction,
  onSubmit,
  children,
}: Prop) {
  const { t } = useTranslation();
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
      <div className={styles.bottomBar} data-has-leading={leadingAction ? "true" : undefined}>
        {leadingAction && <div className={styles.bottomBarLeading}>{leadingAction}</div>}
        {leadingAction ? (
          <div className={styles.bottomBarActions}>
            {secondaryActions}
            {primaryAction}
          </div>
        ) : (
          <>
            {secondaryActions}
            {primaryAction}
          </>
        )}
      </div>
    </>
  );

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className={styles.dialogBase}
      data-size={size}
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
            aria-label={t("components.modalBase.closeButton")}
            onClick={onClose}
          >
            <X size={18} aria-hidden="true" />
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
