import { Fragment, useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { EllipsisVertical } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Project } from "../../../shared/types/project";
import EditProjectModalComponent, {
  type EditProjectFormValues,
} from "../editProjectModal/editProjectModalComponent";
import DeleteProjectModalComponent from "../deleteProjectModal/deleteProjectModalComponent";
import DownloadProjectModalComponent from "../downloadProjectModal/downloadProjectModalComponent";
import { notifySuccess } from "../../services/notify/notifyService";
import {
  downloadProject,
  type ExportFormat,
} from "../../../shared/utils/projectExport";
import { useStatusGroupLabels } from "../../../shared/constants/taskStatus";
import styles from "./projectComponent.module.css";

interface Prop extends Project {
  onEditProject: (id: string, values: EditProjectFormValues) => Promise<void>;
  onDeleteProject: (id: string) => Promise<void>;
  // Task "Gestione del dipendente": false per un dipendente, che vede il
  // progetto e ci lavora sui task ma non può modificarlo né eliminarlo (solo
  // l'owner gestisce il progetto in sé).
  canManage: boolean;
}

type ActiveModal = "edit" | "delete" | "download" | null;

// Raggio e spessore del donut in unità di viewBox (0-100): definiscono uno
// spessore dell'anello proporzionalmente simile alla vecchia barra lineare,
// ma con più superficie per essere leggibile come grafico a sé.
const DONUT_RADIUS = 42;
const DONUT_STROKE_WIDTH = 14;

function ProjectComponent({
  id,
  name,
  customerId,
  tasks,
  onEditProject,
  onDeleteProject,
  canManage,
}: Prop) {
  const { t } = useTranslation();
  const STATUS_GROUP_LABELS = useStatusGroupLabels();
  const navigate = useNavigate();
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [editError, setEditError] = useState("");
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
      label: STATUS_GROUP_LABELS.completed,
      count: completedCount,
      percent: completedPercent,
      donutClassName: styles.donutSegmentCompleted,
      centerClassName: styles.donutCenterCompleted,
    },
    {
      key: "progress",
      label: STATUS_GROUP_LABELS.progress,
      count: progressCount,
      percent: inProgressPercent,
      donutClassName: styles.donutSegmentInProgress,
      centerClassName: styles.donutCenterInProgress,
    },
    {
      key: "review",
      label: STATUS_GROUP_LABELS.review,
      count: reviewCount,
      percent: reviewPercent,
      donutClassName: styles.donutSegmentReview,
      centerClassName: styles.donutCenterReview,
    },
    {
      key: "rejected",
      label: STATUS_GROUP_LABELS.rejected,
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
      ? t("components.project.cardLabelSimple", { name, count: totalTasks })
      : t("components.project.cardLabelWithBreakdown", {
          name,
          count: totalTasks,
          breakdown: segments
            .map((segment) => `${segment.count} ${segment.label.toLowerCase()}`)
            .join(", "),
        });

  function openEditModal() {
    setEditError("");
    setIsMenuOpen(false);
    setActiveModal("edit");
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
    downloadProject({ id, name, customerId, tasks }, format);
  }

  async function handleEdit(values: EditProjectFormValues) {
    try {
      await onEditProject(id, values);
      setActiveModal(null);
      notifySuccess(t("components.project.updateSuccess"));
    } catch (error) {
      setEditError(
        error instanceof Error
          ? error.message
          : t("components.project.updateError"),
      );
    }
  }

  async function handleDelete() {
    try {
      await onDeleteProject(id);
      setActiveModal(null);
      notifySuccess(t("components.project.deleteSuccess"));
    } catch (error) {
      setDeleteError(
        error instanceof Error
          ? error.message
          : t("components.project.deleteError"),
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
            <span className={styles.donutCenterEmpty}>{t("components.project.noTasks")}</span>
          ) : (
            <>
              <span
                className={`${styles.donutCenterText} ${styles.donutCenterDefault}`}
              >
                <strong className={styles.donutCenterValue}>
                  {totalTasks}
                </strong>
                <span className={styles.donutCenterLabel}>
                  {t("components.project.totalTasks")}
                </span>
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
              aria-label={t("components.project.otherActionsLabel", { name })}
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
                  onClick={openEditModal}
                >
                  {t("components.project.edit")}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={styles.popoverItem}
                  onClick={openDeleteModal}
                >
                  {t("components.project.delete")}
                </button>
                <div className={styles.popoverSeparator} role="separator" />
                <button
                  type="button"
                  role="menuitem"
                  className={styles.popoverItem}
                  onClick={openDownloadModal}
                >
                  {t("components.project.download")}
                </button>
              </div>
            )}
          </div>

          <EditProjectModalComponent
            key={activeModal === "edit" ? "edit-open" : "edit-closed"}
            isOpen={activeModal === "edit"}
            onClose={closeModal}
            currentName={name}
            currentCustomerId={customerId}
            onSave={handleEdit}
            submitError={editError}
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
