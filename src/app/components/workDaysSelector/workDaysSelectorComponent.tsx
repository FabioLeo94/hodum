import { useTranslation } from "react-i18next";
import type { WorkDays } from "../../../shared/utils/rateConversion";
import styles from "./workDaysSelectorComponent.module.css";

interface Prop {
  value: WorkDays;
  onChange: (value: WorkDays) => void;
}

const DAY_KEYS: readonly (keyof WorkDays)[] = [
  "lunedi",
  "martedi",
  "mercoledi",
  "giovedi",
  "venerdi",
  "sabato",
  "domenica",
];

// 7 pillole selezionabili per i giorni lavorativi dell'azienda: usate sia da
// EditCompanyDrawerComponent (giorniLavorativi) sia, indirettamente, per
// calcolare le conversioni di tariffa in RateInputComponent (tramite
// isScheduleConfigured/convertRate). Chiavi i18n dedicate (shared.weekdaysShort,
// components.workDaysSelector.dayLabels) invece di riusare
// components.taskCalendar.weekdays, per non far dipendere questo componente
// riusabile dal namespace di un altro.
function WorkDaysSelectorComponent({ value, onChange }: Prop) {
  const { t } = useTranslation();
  const shortLabels = t("shared.weekdaysShort", { returnObjects: true }) as string[];

  function toggleDay(day: keyof WorkDays) {
    onChange({ ...value, [day]: !value[day] });
  }

  return (
    <div
      className={styles.days}
      role="group"
      aria-label={t("components.workDaysSelector.groupLabel")}
    >
      {DAY_KEYS.map((day, index) => (
        <button
          key={day}
          type="button"
          className={styles.dayPill}
          aria-pressed={value[day]}
          aria-label={t(`components.workDaysSelector.dayLabels.${day}`)}
          onClick={() => toggleDay(day)}
        >
          {shortLabels[index]}
        </button>
      ))}
    </div>
  );
}

export default WorkDaysSelectorComponent;
