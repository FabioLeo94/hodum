import { describe, it, expect, afterEach } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { usePageMeta } from "./usePageMeta";

afterEach(() => {
  cleanup();
  document.title = "";
  document.querySelectorAll('meta[name="description"], meta[name="robots"]').forEach(
    (tag) => tag.remove(),
  );
});

describe("usePageMeta", () => {
  it("imposta il document.title con il suffisso del sito", () => {
    renderHook(() => usePageMeta({ title: "Accedi" }));

    expect(document.title).toBe("Accedi · Hodum");
  });

  it("crea il meta description quando non esiste e lo rimuove allo smontaggio", () => {
    const { unmount } = renderHook(() =>
      usePageMeta({ title: "Accedi", description: "Descrizione di test" }),
    );

    expect(
      document.querySelector('meta[name="description"]')?.getAttribute("content"),
    ).toBe("Descrizione di test");

    unmount();

    expect(document.querySelector('meta[name="description"]')).toBeNull();
  });

  it("ripristina il contenuto precedente del meta description esistente", () => {
    const existing = document.createElement("meta");
    existing.setAttribute("name", "description");
    existing.setAttribute("content", "Descrizione originale");
    document.head.appendChild(existing);

    const { unmount } = renderHook(() =>
      usePageMeta({ title: "Dashboard", description: "Descrizione pagina" }),
    );

    expect(
      document.querySelector('meta[name="description"]')?.getAttribute("content"),
    ).toBe("Descrizione pagina");

    unmount();

    expect(
      document.querySelector('meta[name="description"]')?.getAttribute("content"),
    ).toBe("Descrizione originale");
  });

  it("imposta il meta robots noindex per le pagine protette", () => {
    renderHook(() =>
      usePageMeta({ title: "Dashboard", robots: "noindex, nofollow" }),
    );

    expect(
      document.querySelector('meta[name="robots"]')?.getAttribute("content"),
    ).toBe("noindex, nofollow");
  });
});
