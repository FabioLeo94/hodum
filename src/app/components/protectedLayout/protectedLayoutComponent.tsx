import { useEffect, useState } from "react";
import { Outlet } from "react-router";
import AssistantDrawerComponent from "../assistantDrawer/assistantDrawerComponent";
import { subscribeToOwnUserUpdates } from "../../services/realtime/socketService";
import styles from "./protectedLayoutComponent.module.css";

// Esposto via useOutletContext dalle pagine annidate: isAssistantOpen serve a
// spostare i loro FAB locali (es. "Crea nuovo progetto") quando il pannello
// dell'assistente è aperto, così non restano coperti dal pannello.
// setHasLocalFab è il percorso inverso: la pagina dichiara se il proprio FAB
// "+" è effettivamente presente (es. la dashboard lo nasconde ai dipendenti),
// così l'icona dell'assistente può occupare quello spazio invece di lasciarlo
// vuoto - vedi AssistantDrawerComponent.
export interface AssistantLayoutContext {
  isAssistantOpen: boolean;
  setHasLocalFab: (value: boolean) => void;
}

// Montato una sola volta come layout delle rotte protette (vedi App.tsx):
// l'Outlet cambia ad ogni navigazione tra dashboard e task-list, ma questo
// componente - e quindi AssistantDrawerComponent con la sua conversazione -
// non viene mai smontato.
function ProtectedLayoutComponent() {
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  // True di default: la maggior parte delle pagine (task-list, dipendenti) ha
  // sempre un FAB locale e non ha bisogno di dichiararlo esplicitamente.
  const [hasLocalFab, setHasLocalFab] = useState(true);

  // Sottoscritto una sola volta per l'intera sessione protetta (questo
  // componente non si smonta tra una pagina e l'altra, vedi commento sopra):
  // aggiorna lo user reattivo (useAuthUser) quando l'owner modifica questo
  // stesso utente da un'altra sessione, es. promozione a project manager.
  useEffect(() => subscribeToOwnUserUpdates(), []);

  return (
    <>
      <div className={styles.mainArea} data-assistant-open={isAssistantOpen}>
        <Outlet
          context={
            { isAssistantOpen, setHasLocalFab } satisfies AssistantLayoutContext
          }
        />
      </div>
      <AssistantDrawerComponent
        isOpen={isAssistantOpen}
        hasLocalFab={hasLocalFab}
        onToggle={() => setIsAssistantOpen((current) => !current)}
      />
    </>
  );
}

export default ProtectedLayoutComponent;
