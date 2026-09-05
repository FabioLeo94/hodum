import i18n from "../i18n/i18n";

// Mappa la lingua i18next (codice a due lettere) a un locale BCP-47 completo:
// Intl richiede un locale specifico per uno stile di data coerente, "it"/"en"
// da soli lascerebbero la scelta della regione al motore JS.
const DATE_LOCALES: Record<string, string> = {
  it: "it-IT",
  en: "en-US",
};

// Esportata anche per chi deve costruire un proprio Intl.DateTimeFormat (es.
// TaskCalendarComponent per l'intestazione mese/anno, TaskDetailModalComponent
// per la scadenza) restando comunque agganciato alla lingua i18next corrente.
export function resolveDateLocale(): string {
  return DATE_LOCALES[i18n.resolvedLanguage ?? ""] ?? DATE_LOCALES.it;
}

// Condiviso da editEmployeeModal, editAccountModal e topbar: gli unici punti
// che mostrano createdAt/lastLoginAt (entrambi ISO 8601 lato User, vedi
// authService.ts), sempre in sola lettura, quindi centralizzato qui invece di
// richiamare toLocaleString separatamente in ogni componente. Il locale segue
// la lingua i18next corrente (non fisso su "it-IT"): i chiamanti sono tutti
// componenti che già usano useTranslation() e quindi si ri-renderizzano al
// cambio lingua, producendo una nuova chiamata con il locale aggiornato.
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(resolveDateLocale(), { dateStyle: "medium" });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(resolveDateLocale(), {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
