import { useState } from "react";
import type { ReactNode } from "react";

interface ExpandableRenderState {
  isOpen: boolean;
  toggle: () => void;
  locked: boolean;
}

interface ExpandableContainerComponentProps {
  /** Quando true lo stato resta forzato aperto e non richiudibile: usato per
   * i casi in cui non c'è nulla di significativo da collassare (es. un
   * gruppo senza task) o in cui il collasso andrebbe comunque impedito. */
  locked?: boolean;
  defaultOpen?: boolean;
  children: (state: ExpandableRenderState) => ReactNode;
}

// Componente "headless": non renderizza alcun markup proprio (nessun CSS
// co-locato, come protectedRouteComponent), possiede solo lo stato
// aperto/chiuso ed espone toggle/isOpen/locked via render-prop. Necessario
// perché i chiamanti (es. i gruppi di stato nella tabella dei task) devono
// incastonare l'header/il contenuto nella propria struttura DOM (tr/th/tbody
// per una tabella, div per un accordion generico): un wrapper con markup
// fisso non potrebbe rispettare il content model di entrambi i contesti.
function ExpandableContainerComponent({
  locked = false,
  defaultOpen = true,
  children,
}: ExpandableContainerComponentProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = locked ? true : internalOpen;

  function toggle() {
    if (locked) return;
    setInternalOpen((current) => !current);
  }

  return <>{children({ isOpen, toggle, locked })}</>;
}

export default ExpandableContainerComponent;
