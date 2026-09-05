import { Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import styles from "./taskLockedBadgeComponent.module.css";

// Badge mostrato accanto al titolo di un task fatturato (Task.invoiceId
// non-null): sola visualizzazione permanente, vedi il commento su invoiceId
// in shared/types/project.ts. Condiviso tra taskKanbanBoardComponent e
// taskList perché il significato (e lo stile) è identico nelle due viste.
function TaskLockedBadgeComponent() {
  const { t } = useTranslation();
  const label = t("components.taskLockedBadge.label");

  return (
    // title sul contenitore (LucideProps non espone "title", vedi il typecheck
    // di questo file) da' lo stesso tooltip nativo al passaggio del mouse gia'
    // usato dagli altri glifi di sola icona della lista/board (dragHandle,
    // urgencyBadge in taskList.module.css): senza, chi non usa uno screen
    // reader non ha modo di scoprire perche' il task e' bloccato. role/
    // aria-label si spostano di conseguenza sul contenitore, l'icona resta
    // puramente decorativa.
    <span className={styles.lockedBadge} role="img" aria-label={label} title={label}>
      <Lock size={14} aria-hidden="true" />
    </span>
  );
}

export default TaskLockedBadgeComponent;
