import { useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Check } from "lucide-react";
import ModalBaseComponent from "../modalBase/modalBaseComponent";
import ButtonComponent from "../button/buttonComponent";
import type { ExportFormat } from "../../../shared/utils/projectExport";
import styles from "./downloadProjectModalComponent.module.css";

interface FormatOption {
  value: ExportFormat;
  label: string;
  description: string;
}

const FORMAT_OPTIONS: FormatOption[] = [
  {
    value: "json",
    label: "JSON",
    description: "Struttura dati completa del progetto, con task e assegnatari.",
  },
  {
    value: "xml",
    label: "XML",
    description: "Stessi dati in formato a marcatori, per sistemi che li richiedono.",
  },
  {
    value: "csv",
    label: "CSV",
    description: "Elenco dei task in formato tabellare, separato da virgole.",
  },
  {
    value: "excel",
    label: "Excel",
    description: "Foglio di calcolo .xlsx con l'elenco dei task.",
  },
];

interface Prop {
  isOpen: boolean;
  onClose: () => void;
  onDownload: (format: ExportFormat) => void;
}

function DownloadProjectModalComponent({ isOpen, onClose, onDownload }: Prop) {
  // Precompilato al mount di questa istanza, stesso pattern delle altre
  // modali del progetto (il chiamante rimonta via `key` quando si riapre).
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>("json");
  // Un bottone per formato: serve per spostare anche il focus DOM (non solo
  // lo stato) quando le frecce cambiano la selezione, vedi handleGroupKeyDown.
  const optionRefs = useRef<Partial<Record<ExportFormat, HTMLButtonElement | null>>>({});

  function handleDownload() {
    onDownload(selectedFormat);
    onClose();
  }

  // Roving tabindex da manuale ARIA per role="radiogroup": solo l'opzione
  // selezionata è raggiungibile da Tab, le frecce spostano sia il focus sia
  // la selezione fra le quattro card, con wrap-around ai due estremi.
  function handleGroupKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const currentIndex = FORMAT_OPTIONS.findIndex(
      (option) => option.value === selectedFormat,
    );
    let nextIndex: number;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % FORMAT_OPTIONS.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + FORMAT_OPTIONS.length) % FORMAT_OPTIONS.length;
    } else {
      return;
    }
    event.preventDefault();
    const nextFormat = FORMAT_OPTIONS[nextIndex].value;
    setSelectedFormat(nextFormat);
    optionRefs.current[nextFormat]?.focus();
  }

  return (
    <ModalBaseComponent
      isOpen={isOpen}
      onClose={onClose}
      title="Scarica progetto"
      onSubmit={handleDownload}
      primaryAction={<ButtonComponent onClick={() => {}}>Scarica</ButtonComponent>}
      secondaryActions={
        <button type="button" className={styles.cancelButton} onClick={onClose}>
          Annulla
        </button>
      }
    >
      <p className={styles.description}>
        Scegli il formato in cui esportare i dati del progetto.
      </p>
      <div
        className={styles.formatGrid}
        role="radiogroup"
        aria-label="Formato di esportazione"
        onKeyDown={handleGroupKeyDown}
      >
        {FORMAT_OPTIONS.map((option) => {
          const isSelected = selectedFormat === option.value;
          const descriptionId = `download-format-description-${option.value}`;
          return (
            <button
              key={option.value}
              ref={(element) => {
                optionRefs.current[option.value] = element;
              }}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={option.label}
              aria-describedby={descriptionId}
              tabIndex={isSelected ? 0 : -1}
              data-selected={isSelected}
              className={styles.formatOption}
              onClick={() => setSelectedFormat(option.value)}
            >
              {isSelected && (
                <Check
                  size={14}
                  strokeWidth={3}
                  className={styles.checkIcon}
                  aria-hidden="true"
                />
              )}
              <span className={styles.formatName}>{option.label}</span>
              <span id={descriptionId} className={styles.formatDescription}>
                {option.description}
              </span>
            </button>
          );
        })}
      </div>
    </ModalBaseComponent>
  );
}

export default DownloadProjectModalComponent;
