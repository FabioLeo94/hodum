import { useState } from "react";
import { Outlet } from "react-router";
import AssistantDrawerComponent from "../assistantDrawer/assistantDrawerComponent";
import styles from "./protectedLayoutComponent.module.css";

// Esposto via useOutletContext dalle pagine annidate: serve solo per spostare
// i loro FAB locali (es. "Crea nuovo progetto") quando il pannello
// dell'assistente è aperto, così non restano coperti dal pannello.
export interface AssistantLayoutContext {
  isAssistantOpen: boolean;
}

// Montato una sola volta come layout delle rotte protette (vedi App.tsx):
// l'Outlet cambia ad ogni navigazione tra dashboard e task-list, ma questo
// componente - e quindi AssistantDrawerComponent con la sua conversazione -
// non viene mai smontato.
function ProtectedLayoutComponent() {
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);

  return (
    <>
      <div className={styles.mainArea} data-assistant-open={isAssistantOpen}>
        <Outlet context={{ isAssistantOpen } satisfies AssistantLayoutContext} />
      </div>
      <AssistantDrawerComponent
        isOpen={isAssistantOpen}
        onToggle={() => setIsAssistantOpen((current) => !current)}
      />
    </>
  );
}

export default ProtectedLayoutComponent;
