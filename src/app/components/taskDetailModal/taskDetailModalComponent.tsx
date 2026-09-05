import { useTranslation } from "react-i18next";
import ModalBaseComponent from "../modalBase/modalBaseComponent";
import ButtonComponent from "../button/buttonComponent";
import TaskCommentsPanelComponent from "../taskCommentsPanel/taskCommentsPanelComponent";
import AvatarComponent from "../avatar/avatarComponent";
import type { TaskWithProject } from "../../../shared/types/project";
import { useStatusGroupLabels } from "../../../shared/constants/taskStatus";
import { parseDateOnly } from "../../../shared/utils/taskDueDate";
import { resolveDateLocale } from "../../../shared/utils/formatDate";
import styles from "./taskDetailModalComponent.module.css";

interface Prop {
  isOpen: boolean;
  task: TaskWithProject | null;
  onClose: () => void;
  onGoToTask: (task: TaskWithProject) => void;
}

// Sola visualizzazione: la dashboard non è il posto per editare un task (per
// quello si passa da "Vai al task", che apre la modale di modifica esistente
// nella pagina del progetto). Nessuno stato interno da preservare tra
// un'apertura e l'altra, quindi qui non serve il pattern "remount via key" di
// TaskFormModalComponent: si smonta semplicemente quando non c'è un task.
function TaskDetailModalComponent({ isOpen, task, onClose, onGoToTask }: Prop) {
  const { t } = useTranslation();
  const STATUS_GROUP_LABELS = useStatusGroupLabels();

  if (!isOpen || !task) return null;

  return (
    <ModalBaseComponent
      isOpen={isOpen}
      onClose={onClose}
      title={t("components.taskDetailModal.title", { projectName: task.projectName })}
      size="wide"
      primaryAction={
        <ButtonComponent onClick={() => onGoToTask(task)}>
          {t("components.taskDetailModal.goToTask")}
        </ButtonComponent>
      }
      secondaryActions={
        <button type="button" className={styles.closeButton} onClick={onClose}>
          {t("components.taskDetailModal.close")}
        </button>
      }
    >
      <div className={styles.detailLayout}>
        <div className={styles.infoColumn}>
          <h3 className={styles.taskTitle}>{task.title}</h3>
          {task.description && <p className={styles.description}>{task.description}</p>}
          <div className={styles.metaInfo}>
            <p className={styles.metaRow}>
              <span className={styles.metaLabel}>{t("components.taskDetailModal.statusLabel")}</span>
              <span className={styles.metaValue}>{STATUS_GROUP_LABELS[task.status]}</span>
            </p>
            <p className={styles.metaRow}>
              <span className={styles.metaLabel}>{t("components.taskDetailModal.priorityLabel")}</span>
              <span className={styles.metaValue}>{task.priority}</span>
            </p>
            <p className={styles.metaRow}>
              <span className={styles.metaLabel}>{t("components.taskDetailModal.dueDateLabel")}</span>
              <span className={styles.metaValue}>
                {task.dueDate
                  ? parseDateOnly(task.dueDate).toLocaleDateString(resolveDateLocale(), {
                      dateStyle: "medium",
                    })
                  : t("components.taskDetailModal.noDueDate")}
              </span>
            </p>
          </div>
          <div className={styles.assigneesField}>
            <span className={styles.selectLabel}>{t("components.taskDetailModal.assigneesLabel")}</span>
            {task.assignees.length === 0 ? (
              <p className={styles.noAssignees}>{t("components.taskDetailModal.noAssignees")}</p>
            ) : (
              <ul className={styles.assigneesList}>
                {task.assignees.map((assignee) => (
                  <li key={assignee.id} className={styles.assigneeRow}>
                    <AvatarComponent username={assignee.username} size="sm" />
                    <span>{assignee.username}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className={styles.commentsColumn}>
          <TaskCommentsPanelComponent projectId={task.projectId} taskId={task.id} readOnly />
        </div>
      </div>
    </ModalBaseComponent>
  );
}

export default TaskDetailModalComponent;
