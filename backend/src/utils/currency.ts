import type { CurrencyCode } from '../models/company';

// Elenco chiuso di valute supportate, stessi valori del CHECK su
// companies.valuta/customers.valuta/invoices.valuta (migrations 0043/0044/
// 0045): nessuna conversione tra valute (vedi .tasks/TASK.md, punto 1), solo
// etichettatura/formattazione degli importi già calcolati.
export const CURRENCY_CODES: CurrencyCode[] = ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD', 'CNY'];

export function isValidCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === 'string' && (CURRENCY_CODES as string[]).includes(value);
}

// Validazione condivisa da companyService/customerService, stesso principio
// di validateAndNormalizeRate in rateUnit.ts: null/undefined passano
// invariati a null (per Company il chiamante decide se è un errore — la
// valuta aziendale è sempre obbligatoria — mentre per Customer null è lo
// stato valido "eredita dalla company"). `onInvalid` costruisce l'errore nel
// tipo di dominio del chiamante (InvalidCompanyDataError/InvalidTariffaError),
// stesso motivo di rateUnit.ts.
export function validateAndNormalizeCurrency(
  value: string | null | undefined,
  onInvalid: (message: string) => Error,
): CurrencyCode | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (!isValidCurrencyCode(value)) {
    throw onInvalid(`valuta deve essere una tra: ${CURRENCY_CODES.join(', ')}`);
  }
  return value;
}
