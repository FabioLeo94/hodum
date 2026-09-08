import { MonitorSmartphone } from "lucide-react";
import { useTranslation } from "react-i18next";
import styles from "./mobileBlockComponent.module.css";

// Overlay sempre montato: è la media query in mobileBlockComponent.module.css
// (non uno stato React) a decidere se è visibile, così il blocco vale anche
// prima che React finisca il primo render e non dipende da un listener di
// resize lato JS.
function MobileBlockComponent() {
  const { t } = useTranslation();

  return (
    <div className={styles.container} role="alert">
      <MonitorSmartphone
        className={styles.icon}
        size={48}
        aria-hidden="true"
      />
      <p className={styles.message}>{t("components.mobileBlock.message")}</p>
    </div>
  );
}

export default MobileBlockComponent;
