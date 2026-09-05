import { useTranslation } from "react-i18next";
import InputComponent from "../input/inputComponent";
import type { WorkHours } from "../../../shared/utils/rateConversion";
import styles from "./workHoursEditorComponent.module.css";

interface Prop {
  value: WorkHours;
  onChange: (value: WorkHours) => void;
}

// Componente interamente controllato (nessuno stato locale che duplica
// `value`): quando l'utente disattiva "Continuativo" i campi inizio2/fine2
// spariscono dalla UI ma restano intatti nell'oggetto `value` del chiamante
// (qui non vengono mai azzerati), così riattivarlo li ritrova invariati. Il
// backend forza inizio2/fine2 a null quando continuativo=true al salvataggio
// (vedi backend/src/controllers/companyController.ts, updateCompany): non è
// responsabilità di questo componente farlo prima.
function WorkHoursEditorComponent({ value, onChange }: Prop) {
  const { t } = useTranslation();

  function setField(field: keyof WorkHours, raw: string) {
    onChange({ ...value, [field]: raw === "" ? null : raw });
  }

  return (
    <div className={styles.editor}>
      <button
        type="button"
        role="switch"
        aria-checked={value.continuativo}
        className={styles.switch}
        onClick={() => onChange({ ...value, continuativo: !value.continuativo })}
      >
        <span className={styles.switchTrack} aria-hidden="true">
          <span className={styles.switchThumb} />
        </span>
        <span className={styles.switchLabel}>{t("components.workHoursEditor.continuousLabel")}</span>
      </button>

      {value.continuativo ? (
        <div className={styles.timeRow}>
          <InputComponent
            type="time"
            label={t("components.workHoursEditor.openingLabel")}
            value={value.inizio1 ?? ""}
            onChange={(event) => setField("inizio1", event.target.value)}
            showLabel
          />
          <InputComponent
            type="time"
            label={t("components.workHoursEditor.closingLabel")}
            value={value.fine1 ?? ""}
            onChange={(event) => setField("fine1", event.target.value)}
            showLabel
          />
        </div>
      ) : (
        <>
          <p className={styles.groupLabel}>{t("components.workHoursEditor.morningLabel")}</p>
          <div className={styles.timeRow}>
            <InputComponent
              type="time"
              label={t("components.workHoursEditor.morningStartLabel")}
              value={value.inizio1 ?? ""}
              onChange={(event) => setField("inizio1", event.target.value)}
              showLabel
            />
            <InputComponent
              type="time"
              label={t("components.workHoursEditor.morningEndLabel")}
              value={value.fine1 ?? ""}
              onChange={(event) => setField("fine1", event.target.value)}
              showLabel
            />
          </div>
          <p className={styles.groupLabel}>{t("components.workHoursEditor.afternoonLabel")}</p>
          <div className={styles.timeRow}>
            <InputComponent
              type="time"
              label={t("components.workHoursEditor.afternoonStartLabel")}
              value={value.inizio2 ?? ""}
              onChange={(event) => setField("inizio2", event.target.value)}
              showLabel
            />
            <InputComponent
              type="time"
              label={t("components.workHoursEditor.afternoonEndLabel")}
              value={value.fine2 ?? ""}
              onChange={(event) => setField("fine2", event.target.value)}
              showLabel
            />
          </div>
        </>
      )}
    </div>
  );
}

export default WorkHoursEditorComponent;
