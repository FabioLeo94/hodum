// Specchio di backend/src/utils/currency.ts: stesso elenco chiuso di valute
// supportate, nessuna conversione tra valute (vedi .tasks/TASK.md, punto 1),
// solo etichettatura/formattazione degli importi già calcolati.
export type CurrencyCode = "EUR" | "USD" | "GBP" | "CHF" | "JPY" | "CAD" | "AUD" | "CNY";

export const CURRENCY_CODES: CurrencyCode[] = ["EUR", "USD", "GBP", "CHF", "JPY", "CAD", "AUD", "CNY"];
