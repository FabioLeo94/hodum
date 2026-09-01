import { useRef, useState } from "react";

/**
 * Ciclo isSubmitting/guardia-doppio-submit/swallow-errore comune a tutte le
 * modali con submit asincrono (create/rename/delete progetto, task,
 * dipendente, assegnazione progetti): ognuna valida i propri campi prima di
 * chiamare `submit`, che si occupa solo della parte comune. L'errore non
 * viene ripropagato al chiamante: resta responsabilità della action passata
 * comunicarlo (tipicamente tramite la prop submitError del componente), qui
 * si evita solo una unhandled rejection e si permette il retry.
 *
 * Il flag di guardia vive anche in un ref, non solo nello state: due submit
 * ravvicinati (doppio click prima che il re-render disabiliti il bottone)
 * leggerebbero altrimenti lo stesso `isSubmitting` non ancora aggiornato.
 */
export function useAsyncSubmit() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);

  async function submit(action: () => Promise<void>) {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {
      await action();
    } catch {
      // il chiamante di `action` è responsabile di segnalare l'errore
      // (submitError): qui si evita solo l'unhandled rejection.
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  return { isSubmitting, submit };
}
