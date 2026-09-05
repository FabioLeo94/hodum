import { useTranslation } from "react-i18next";
import styles from "./prioritySelectComponent.module.css";

// 1 = più urgente, 10 = meno urgente (stesso significato del campo Task.priority,
// vedi src/shared/types/project.ts). Dieci valori distinti sono troppi per dieci
// colori distinguibili: li raggruppiamo in tre fasce semantiche (stesso linguaggio
// "rosso/ambra/verde" già familiare da TaskStatusSelectComponent) e affianchiamo
// il numero esatto nell'etichetta, così la fascia dà la gerarchia a colpo d'occhio
// e il numero resta disponibile per un confronto preciso o per l'ordinamento.
type PriorityTier = "high" | "medium" | "low";

function getPriorityTier(priority: number): PriorityTier {
  if (priority <= 3) return "high";
  if (priority <= 6) return "medium";
  return "low";
}

const TIER_STYLES: Record<PriorityTier, string> = {
  high: styles.priorityHigh,
  medium: styles.priorityMedium,
  low: styles.priorityLow,
};

const PRIORITY_VALUES: readonly number[] = Array.from({ length: 10 }, (_, index) => index + 1);

interface Prop {
  priority: number;
  onChange: (priority: number) => void;
  taskTitle: string;
  disabled?: boolean;
}

function PrioritySelectComponent({
  priority,
  onChange,
  taskTitle,
  disabled = false,
}: Prop) {
  const { t } = useTranslation();
  const tier = getPriorityTier(priority);
  const TIER_LABELS: Record<PriorityTier, string> = {
    high: t("components.prioritySelect.tier.high"),
    medium: t("components.prioritySelect.tier.medium"),
    low: t("components.prioritySelect.tier.low"),
  };

  return (
    <select
      className={`${styles.prioritySelect} ${TIER_STYLES[tier]}`}
      aria-label={t("components.prioritySelect.ariaLabel", { taskTitle })}
      value={priority}
      disabled={disabled}
      onChange={(event) => onChange(Number(event.target.value))}
    >
      {PRIORITY_VALUES.map((value) => (
        <option key={value} value={value}>
          {`${TIER_LABELS[getPriorityTier(value)]} (${value})`}
        </option>
      ))}
    </select>
  );
}

export default PrioritySelectComponent;
