import { useEffect } from "react";

const SITE_NAME = "Hodum";

interface PageMetaOptions {
  /** Titolo della pagina, senza il suffisso del sito (aggiunto automaticamente). */
  title: string;
  /** Meta description: valorizzare solo per pagine pubbliche indicizzabili. */
  description?: string;
  /** Es. "noindex, nofollow" per pagine dietro autenticazione. */
  robots?: string;
}

function upsertMeta(name: string, content: string): () => void {
  const existing = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);

  if (existing) {
    const previousContent = existing.getAttribute("content");
    existing.setAttribute("content", content);
    return () => {
      if (previousContent === null) {
        existing.remove();
      } else {
        existing.setAttribute("content", previousContent);
      }
    };
  }

  const tag = document.createElement("meta");
  tag.setAttribute("name", name);
  tag.setAttribute("content", content);
  document.head.appendChild(tag);
  return () => tag.remove();
}

/**
 * Imposta document.title e i meta tag rilevanti (description, robots) al montaggio
 * della pagina, ripristinando lo stato precedente allo smontaggio. Non è installata
 * nessuna libreria di head management nel progetto: soluzione nativa minimale, senza
 * nuove dipendenze.
 */
export function usePageMeta({ title, description, robots }: PageMetaOptions) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${title} · ${SITE_NAME}`;

    const restoreFns: Array<() => void> = [];
    if (description) restoreFns.push(upsertMeta("description", description));
    if (robots) restoreFns.push(upsertMeta("robots", robots));

    return () => {
      document.title = previousTitle;
      restoreFns.forEach((restore) => restore());
    };
  }, [title, description, robots]);
}
