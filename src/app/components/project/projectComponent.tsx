import { Fragment, useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { EllipsisVertical } from "lucide-react";
import type { Project } from "../../../shared/types/project";
import RenameProjectModalComponent from "../renameProjectModal/renameProjectModalComponent";
import DeleteProjectModalComponent from "../deleteProjectModal/deleteProjectModalComponent";
import DownloadProjectModalComponent from "../downloadProjectModal/downloadProjectModalComponent";
import {
  downloadProject,
  type ExportFormat,
} from "../../../shared/utils/projectExport";
import styles from "./projectComponent.module.css";

interface Prop extends Project {
  onRenameProject: (id: string, name: string) => Promise<void>;
  onDeleteProject: (id: string) => Promise<void>;
  // Task "Gestione del dipendente": false per un dipendente, che vede il
  // progetto e ci lavora sui task ma non può rinominarlo né eliminarlo (solo
  // l'owner gestisce il progetto in sé).
  canManage: boolean;
}

type ActiveModal = "rename" | "delete" | "download" | null;

// Raggio e spessore del donut in unità di viewBox (0-100): definiscono uno
// spessore dell'anello proporzionalmente simile alla vecchia barra lineare,
// ma con più superficie per essere leggibile come grafico a sé.
const DONUT_RADIUS = 42;
const DONUT_STROKE_WIDTH = 14;

function ProjectComponent({
  id,
  name,
  tasks,
  onRenameProject,
  onDeleteProject,
  canManage,
}: Prop) {
  const navigate = useNavigate();
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
      donutClassName: styles.donutSegmentCompleted,
      centerClassName: styles.donutCenterCompleted,
    },
    {
      key: "progress",
      label: "In corso",
      count: progressCount,
      percent: inProgressPercent,
      donutClassName: styles.donutSegmentInProgress,
      centerClassName: styles.donutCenterInProgress,
    },
    {
      key: "review",
      label: "In review",
      count: reviewCount,
      percent: reviewPercent,
      donutClassName: styles.donutSegmentReview,
      centerClassName: styles.donutCenterReview,
    },
    {
      key: "rejected",
      label: "Rifiutati",
      count: rejectedCount,
      percent: rejectedPercent,
      donutClassName: styles.donutSegmentRejected,
      centerClassName: styles.donutCenterRejected,
    },
  ].filter((segment) => segment.percent > 0);

  // Offset cumulativo (in %, 0-100) di ogni arco lungo la circonferenza:
  // ogni <circle> usa pathLength=100, quindi dasharray/dashoffset possono
  // esprimersi direttamente in percentuale senza calcolare la circonferenza reale.
  let cumulativePercent = 0;
  const donutSegments = segments.map((segment) => {
    const donutSegment = { ...segment, offset: cumulativePercent };
    cumulativePercent += segment.percent;
    return donutSegment;
  });

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

  function openDownloadModal() {
    setIsMenuOpen(false);
    setActiveModal("download");
  }

  function closeModal() {
    setActiveModal(null);
  }

  function handleDownload(format: ExportFormat) {
    downloadProject({ id, name, tasks }, format);
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
      </div>
      {/* Il donut sta sopra .cardLink (z-index) per ricevere l'hover sui
          singoli segmenti: l'onClick replica la navigazione del link
          sottostante così il click continua a funzionare su tutta la card. */}
      <div
        className={styles.donutWrapper}
        aria-hidden="true"
        onClick={() => navigate(`/dashboard/${id}/task-list`)}
      >
        <svg className={styles.donutSvg} viewBox="0 0 100 100">
          <circle
            className={
              totalTasks === 0 ? styles.donutTrackEmpty : styles.donutTrack
            }
            cx="50"
            cy="50"
            r={DONUT_RADIUS}
            strokeWidth={DONUT_STROKE_WIDTH}
            fill="none"
            pathLength={100}
          />
          {totalTasks > 0 &&
            donutSegments.map((segment) => (
              <circle
                key={segment.key}
                className={`${styles.donutSegment} ${segment.donutClassName}`}
                cx="50"
                cy="50"
                r={DONUT_RADIUS}
                strokeWidth={DONUT_STROKE_WIDTH}
                fill="none"
                pathLength={100}
                strokeDasharray={`${segment.percent} ${100 - segment.percent}`}
                strokeDashoffset={-segment.offset}
              />
            ))}
        </svg>

        <div className={styles.donutCenter}>
          {totalTasks === 0 ? (
            <span className={styles.donutCenterEmpty}>Nessun task</span>
          ) : (
            <>
              <span
                className={`${styles.donutCenterText} ${styles.donutCenterDefault}`}
              >
                <strong className={styles.donutCenterValue}>
                  {totalTasks}
                </strong>
                <span className={styles.donutCenterLabel}>task totali</span>
              </span>
              {donutSegments.map((segment) => (
                <span
                  key={segment.key}
                  className={`${styles.donutCenterText} ${segment.centerClassName}`}
                >
                  <strong className={styles.donutCenterValue}>
                    {segment.count}
                  </strong>
                  <span className={styles.donutCenterLabel}>
                    {segment.label}
                  </span>
                </span>
              ))}
            </>
          )}
        </div>
      </div>

      {canManage && (
        <Fragment>
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
              <EllipsisVertical size={18} aria-hidden="true" />
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
                <div className={styles.popoverSeparator} role="separator" />
                <button
                  type="button"
                  role="menuitem"
                  className={styles.popoverItem}
                  onClick={openDownloadModal}
                >
                  Scarica...
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
          <DownloadProjectModalComponent
            key={activeModal === "download" ? "download-open" : "download-closed"}
            isOpen={activeModal === "download"}
            onClose={closeModal}
            onDownload={handleDownload}
          />
        </Fragment>
      )}
    </div>
  );
}

export default ProjectComponent;
