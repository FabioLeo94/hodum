import { useId } from "react";
import { useTranslation } from "react-i18next";
import { CURRENCY_CODES, type CurrencyCode } from "../../../shared/utils/currency";
import styles from "./currencySelectComponent.module.css";

interface Prop {
  /** null è uno stato valido solo con allowInherit=true ("eredita dalla company"). */
  value: CurrencyCode | null;
  onChange: (value: CurrencyCode | null) => void;
  label: string;
  /** Mostra l'opzione "eredita dalla company" (null): usata solo dal form
   * cliente, mai da quello azienda, dove la valuta è sempre obbligatoria. */
  allowInherit?: boolean;
  name?: string;
  required?: boolean;
}

// Coppia label+select riusata da editCompanyDrawerComponent (obbligatoria) e
// customersDrawerComponent (opzionale, allowInherit=true): stesso principio
// di RateInputComponent, un solo posto per l'elenco di valute invece di
// duplicarlo nei due form.
function CurrencySelectComponent({ value, onChange, label, allowInherit = false, name, required }: Prop) {
  const { t } = useTranslation();
  const selectId = useId();

  const INHERIT_VALUE = "";

  return (
    <div className={styles.wrapper}>
      <label className={styles.label} htmlFor={selectId}>
        {label}
      </label>
      <select
        id={selectId}
        className={styles.select}
        name={name}
        required={required}
        value={value ?? INHERIT_VALUE}
        onChange={(event) => onChange(event.target.value === INHERIT_VALUE ? null : (event.target.value as CurrencyCode))}
      >
        {allowInherit && <option value={INHERIT_VALUE}>{t("components.currencySelect.inheritOption")}</option>}
        {CURRENCY_CODES.map((code) => (
          <option key={code} value={code}>
            {code}
          </option>
        ))}
      </select>
    </div>
  );
}

export default CurrencySelectComponent;
