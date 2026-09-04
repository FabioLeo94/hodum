import type { ReactNode } from "react";
import styles from "./managementCardComponent.module.css";

interface Prop {
  icon: ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}

// Generico (icona + titolo + descrizione, apre qualcosa al click) invece di
// specifico "backup": la pagina Gestione aziendale (companyManagement.tsx)
// oggi ha una sola card, ma il componente non presuppone quale, così le
// prossime aggiungono solo un altro elemento nella griglia, non un nuovo
// componente di card.
function ManagementCardComponent({ icon, title, description, onClick }: Prop) {
  return (
    <button type="button" className={styles.card} onClick={onClick}>
      <span className={styles.icon} aria-hidden="true">
        {icon}
      </span>
      <span className={styles.title}>{title}</span>
      <span className={styles.description}>{description}</span>
    </button>
  );
}

export default ManagementCardComponent;
