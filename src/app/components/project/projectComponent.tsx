import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router";
import type { Project } from "../../../shared/types/project";
import RenameProjectModalComponent from "../renameProjectModal/renameProjectModalComponent";
import DeleteProjectModalComponent from "../deleteProjectModal/deleteProjectModalComponent";
import styles from "./projectComponent.module.css";

interface Prop extends Project {
  onRenameProject: (id: string, name: string) => Promise<void>;
  onDeleteProject: (id: string) => Promise<void>;
}

type ActiveModal = "rename" | "delete" | null;

function ProjectComponent({
  id,
  name,
  tasks,
  onRenameProject,
  onDeleteProject,
}: Prop) {
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [renameError, setRenameError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuId = useId();
  const kebabContainerRef = useRef<HTMLDivElement>(null);
  const kebabButtonRef = useRef<HTMLButtonElement>(null);
  const firstMenuItemRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isMenuOpen) return;

    firstMenuItemRef.current?.focus();

    function handlePointerDown(event: PointerEvent) {
      if (
        kebabContainerRef.current &&
        !kebabContainerRef.current.contains(event.target as Node)
      ) {
        setIsMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
        kebabButtonRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMenuOpen]);

  const totalTasks = tasks.length;
  const completedCount = tasks.filter((t) => t.status === "completed").length;
  const progressCount = tasks.filter((t) => t.status === "progress").length;
  const reviewCount = tasks.filter((t) => t.status === "review").length;
  const rejectedCount = tasks.filter((t) => t.status === "rejected").length;
  const completedPercent =
    totalTasks === 0 ? 0 : (completedCount / totalTasks) * 100;
  const inProgressPercent =
    totalTasks === 0 ? 0 : (progressCount / totalTasks) * 100;
  const reviewPercent = totalTasks === 0 ? 0 : (reviewCount / totalTasks) * 100;
  const rejectedPercent =
    totalTasks === 0 ? 0 : (rejectedCount / totalTasks) * 100;

  const segments = [
    {
      key: "completed",
      label: "Completati",
      count: completedCount,
      percent: completedPercent,
      className: styles.progressCompleted,
    },
    {
      key: "progress",
      label: "In corso",
      count: progressCount,
      percent: inProgressPercent,
      className: styles.progressInProgress,
    },
    {
      key: "review",
      label: "In review",
      count: reviewCount,
      percent: reviewPercent,
      className: styles.progressReview,
    },
    {
      key: "rejected",
      label: "Rifiutati",
      count: rejectedCount,
      percent: rejectedPercent,
      className: styles.progressRejected,
    },
  ].filter((segment) => segment.percent > 0);

  const cardLabel =
    segments.length === 0
      ? `${name}, ${totalTasks} task`
      : `${name}, ${totalTasks} task: ${segments
          .map((segment) => `${segment.count} ${segment.label.toLowerCase()}`)
          .join(", ")}`;

  function openRenameModal() {
    setRenameError("");
    setIsMenuOpen(false);
    setActiveModal("rename");
  }

  function openDeleteModal() {
    setDeleteError("");
    setIsMenuOpen(false);
    setActiveModal("delete");
  }

  function closeModal() {
    setActiveModal(null);
  }

  async function handleRename(newName: string) {
    try {
      await onRenameProject(id, newName);
      setActiveModal(null);
    } catch (error) {
      setRenameError(
        error instanceof Error
          ? error.message
          : "Impossibile aggiornare il progetto.",
      );
    }
  }

  async function handleDelete() {
    try {
      await onDeleteProject(id);
      setActiveModal(null);
    } catch (error) {
      setDeleteError(
        error instanceof Error
          ? error.message
          : "Impossibile eliminare il progetto.",
      );
    }
  }

  return (
    <div className={styles.projectCard}>
      <Link
        to={`/dashboard/${id}/task-list`}
        className={styles.cardLink}
        aria-label={cardLabel}
      />
      <div className={styles.cardHeader} aria-hidden="true">
        <span className={styles.projectName} title={name}>
          {name}
        </span>
        <span className={styles.taskTotal}>{totalTasks} task</span>
      </div>
      <div className={styles.progressBar} aria-hidden="true">
        {segments.map((segment) => (
          <div
            key={segment.key}
            className={`${styles.progressSegment} ${segment.className}`}
            style={{ width: `${segment.percent}%` }}
            data-tooltip={`${segment.count} ${segment.label}`}
          />
        ))}
      </div>

      <div className={styles.hoverActions}>
        <button
          type="button"
          className={styles.iconButton}
          aria-label={`Rinomina progetto ${name}`}
          onClick={openRenameModal}
        >
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </button>
        <button
          type="button"
          className={`${styles.iconButton} ${styles.iconButtonDanger}`}
          aria-label={`Elimina progetto ${name}`}
          onClick={openDeleteModal}
        >
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 6h18" />
            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
          </svg>
        </button>
      </div>

      <div className={styles.kebabArea} ref={kebabContainerRef}>
        <button
          ref={kebabButtonRef}
          type="button"
          className={styles.kebabButton}
          aria-label={`Altre azioni per ${name}`}
          aria-haspopup="menu"
          aria-expanded={isMenuOpen}
          aria-controls={menuId}
          onClick={() => setIsMenuOpen((current) => !current)}
        >
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="currentColor"
            stroke="none"
            aria-hidden="true"
          >
            <circle cx="12" cy="5" r="1.6" />
            <circle cx="12" cy="12" r="1.6" />
            <circle cx="12" cy="19" r="1.6" />
          </svg>
        </button>
        {isMenuOpen && (
          <div id={menuId} role="menu" className={styles.popoverMenu}>
            <button
              ref={firstMenuItemRef}
              type="button"
              role="menuitem"
              className={styles.popoverItem}
              onClick={openRenameModal}
            >
              Rinomina
            </button>
            <button
              type="button"
              role="menuitem"
              className={styles.popoverItem}
              onClick={openDeleteModal}
            >
              Elimina
            </button>
          </div>
        )}
      </div>

      <RenameProjectModalComponent
        key={activeModal === "rename" ? "rename-open" : "rename-closed"}
        isOpen={activeModal === "rename"}
        onClose={closeModal}
        currentName={name}
        onRename={handleRename}
        submitError={renameError}
      />
      <DeleteProjectModalComponent
        isOpen={activeModal === "delete"}
        onClose={closeModal}
        projectName={name}
        onConfirm={handleDelete}
        submitError={deleteError}
      />
    </div>
  );
}

export default ProjectComponent;
