import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  convertRate,
  isScheduleConfigured,
  RATE_UNITS,
  type RateUnit,
  type WorkDays,
  type WorkHours,
} from "../../../shared/utils/rateConversion";
import styles from "./rateInputComponent.module.css";

// convertRate passa per divisioni/moltiplicazioni in virgola mobile (es.
// 52/12 settimane/mese): senza arrotondare, il campo mostrerebbe valori come
// "8666.666666666668" invece di "8666.67". Il valore canonico scambiato con
// onChange non passa da qui, solo la stringa visualizzata nell'input.
function roundForDisplay(amount: number): number {
  return Math.round(amount * 100) / 100;
}

interface Prop {
  /** Tariffa oraria canonica (sempre €/ora), indipendente dall'unità visualizzata. */
  value: number | null;
  unit: RateUnit | null;
  workDays: WorkDays;
  workHours: WorkHours;
  onChange: (value: number | null, unit: RateUnit | null) => void;
  label: string;
  name?: string;
  required?: boolean;
}

// Coppia (numero + unità) per una tariffa: l'unico stato canonico che esce da
// qui è sempre in €/ora (value/unit prop), lo stato locale displayValue/
// displayUnit esiste solo per mostrare il numero nell'unità scelta dall'utente
// senza perdere precisione di digitazione ad ogni render (es. "12," a metà
// digitazione non deve sparire per un arrotondamento del valore canonico).
function RateInputComponent({ value, unit, workDays, workHours, onChange, label, name, required }: Prop) {
  const { t } = useTranslation();
  const inputId = useId();
  const hintId = useId();

  const [displayUnit, setDisplayUnit] = useState<RateUnit>(unit ?? "oraria");
  const [displayValue, setDisplayValue] = useState<string>(
    value === null
      ? ""
      : String(roundForDisplay(convertRate(value, "oraria", unit ?? "oraria", workDays, workHours))),
  );

  // Ri-sincronizza lo stato visualizzato quando value/unit cambiano
  // dall'esterno (es. il caricamento iniziale del drawer): confrontato
  // durante il render, stesso pattern "prevX" già usato da
  // EditCompanyDrawerComponent/CustomersDrawerComponent per resettare stato
  // derivato da una prop senza un useEffect dedicato.
  const [prevValue, setPrevValue] = useState(value);
  const [prevUnit, setPrevUnit] = useState(unit);
  if (value !== prevValue || unit !== prevUnit) {
    setPrevValue(value);
    setPrevUnit(unit);
    setDisplayUnit(unit ?? "oraria");
    setDisplayValue(
      value === null
        ? ""
        : String(roundForDisplay(convertRate(value, "oraria", unit ?? "oraria", workDays, workHours))),
    );
  }

  const scheduleConfigured = isScheduleConfigured(workDays, workHours);

  function handleValueChange(raw: string) {
    setDisplayValue(raw);
    const trimmed = raw.trim();
    if (trimmed === "") {
      onChange(null, null);
      return;
    }
    const parsed = Number(trimmed);
    if (Number.isNaN(parsed)) return;
    onChange(convertRate(parsed, displayUnit, "oraria", workDays, workHours), displayUnit);
  }

  function handleUnitChange(newUnit: RateUnit) {
    setDisplayUnit(newUnit);
    const trimmed = displayValue.trim();
    if (trimmed === "") return;
    const parsed = Number(trimmed);
    if (Number.isNaN(parsed)) return;
    setDisplayValue(String(roundForDisplay(convertRate(parsed, displayUnit, newUnit, workDays, workHours))));
    onChange(convertRate(parsed, displayUnit, "oraria", workDays, workHours), newUnit);
  }

  return (
    <div className={styles.rateInput}>
      <label className={styles.label} htmlFor={inputId}>
        {label}
      </label>
      <div className={styles.row}>
        <input
          id={inputId}
          className={styles.valueField}
          type="number"
          min={0}
          step="0.01"
          name={name}
          required={required}
          value={displayValue}
          onChange={(event) => handleValueChange(event.target.value)}
          aria-describedby={scheduleConfigured ? undefined : hintId}
        />
        <select
          className={styles.unitField}
          aria-label={t("components.rateInput.unitLabel")}
          value={displayUnit}
          onChange={(event) => handleUnitChange(event.target.value as RateUnit)}
        >
          {RATE_UNITS.map((rateUnit) => (
            <option key={rateUnit} value={rateUnit} disabled={rateUnit !== "oraria" && !scheduleConfigured}>
              {t(`components.rateInput.units.${rateUnit}`)}
            </option>
          ))}
        </select>
      </div>
      {!scheduleConfigured && (
        <p id={hintId} className={styles.hint}>
          {t("components.rateInput.scheduleHint")}
        </p>
      )}
    </div>
  );
}

export default RateInputComponent;
