import type { RateUnit } from '../models/company';

// Stessi 5 valori del CHECK su companies.tariffa_unita (migration 0033) e
// customers.tariffa_unita (migration 0034): entrambe le entità applicano
// esattamente la stessa regola di accoppiamento con tariffaOraria, prima
// scritta due volte (customerService.validateAndNormalizeTariffa e
// companyController, righe ~27-34/392-412) invece che qui una sola.
export const RATE_UNITS: RateUnit[] = ['oraria', 'giornaliera', 'settimanale', 'mensile', 'annuale'];

export interface NormalizedRate {
  tariffaOraria: number | null;
  tariffaUnita: RateUnit | null;
}

// Validazione e normalizzazione condivisa: numero >= 0 se presente,
// accoppiamento con tariffaUnita (null se tariffaOraria è null/assente,
// default 'oraria' se tariffaOraria è presente e tariffaUnita è
// assente/null). `onInvalid` costruisce l'errore nel tipo di dominio del
// chiamante (InvalidTariffaError per customerService, InvalidCompanyDataError
// per companyService): questo helper non ne conosce nessuno dei due, così
// ogni service continua a intercettare un solo tipo di errore proprio.
export function validateAndNormalizeRate(
  tariffaOraria: number | null | undefined,
  tariffaUnita: RateUnit | null | undefined,
  onInvalid: (message: string) => Error,
): NormalizedRate {
  if (
    tariffaOraria !== undefined &&
    tariffaOraria !== null &&
    (typeof tariffaOraria !== 'number' || Number.isNaN(tariffaOraria) || tariffaOraria < 0)
  ) {
    throw onInvalid('tariffaOraria deve essere un numero maggiore o uguale a 0');
  }
  const normalizedTariffaOraria = tariffaOraria ?? null;
  if (normalizedTariffaOraria === null) {
    return { tariffaOraria: null, tariffaUnita: null };
  }
  const normalizedTariffaUnita = tariffaUnita ?? 'oraria';
  if (!RATE_UNITS.includes(normalizedTariffaUnita)) {
    throw onInvalid(`tariffaUnita deve essere una tra: ${RATE_UNITS.join(', ')}`);
  }
  return { tariffaOraria: normalizedTariffaOraria, tariffaUnita: normalizedTariffaUnita };
}
