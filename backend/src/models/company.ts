// Stessi 5 valori del CHECK su companies.tariffa_unita/customers.tariffa_unita
// (migrations/0033_add_tariffa_e_orari_lavoro_a_companies.sql e
// 0034_add_tariffa_a_customers.sql): l'unità è solo per la visualizzazione/
// inserimento lato frontend, non serve a interpretare tariffaOraria (sempre
// canonica in €/ora).
export type RateUnit = 'oraria' | 'giornaliera' | 'settimanale' | 'mensile' | 'annuale';

// Elenco chiuso di valute supportate (vedi backend/src/utils/currency.ts):
// nessuna conversione tra valute, servono solo a etichettare/formattare gli
// importi già espressi in tariffaOraria/totaleImporto, che restano numeri
// puri come prima di questa feature (vedi .tasks/TASK.md, punto 1).
export type CurrencyCode = 'EUR' | 'USD' | 'GBP' | 'CHF' | 'JPY' | 'CAD' | 'AUD' | 'CNY';

// I 7 giorni della settimana in cui l'azienda presta servizio (0033,
// lavora_lunedi..lavora_domenica): sempre boolean, mai null, default false già
// garantito dal DB.
export interface WorkDays {
  lunedi: boolean;
  martedi: boolean;
  mercoledi: boolean;
  giovedi: boolean;
  venerdi: boolean;
  sabato: boolean;
  domenica: boolean;
}

// Orario di lavoro dell'azienda (0033): continuativo = un'unica fascia
// (inizio1/fine1), altrimenti due fasce distinte con pausa nel mezzo
// (inizio2/fine2 valorizzate solo in quel caso). Stringhe in formato "HH:mm"
// (vedi normalizzazione in companyService.toCompany).
export interface WorkHours {
  continuativo: boolean;
  inizio1: string | null;
  fine1: string | null;
  inizio2: string | null;
  fine2: string | null;
}

// Forma dell'entità Company esposta dall'API: camelCase lato applicativo,
// coerente con project.ts/task.ts (vedi migrations/0013_create_companies_table.sql
// e 0030_add_dati_anagrafici_a_companies.sql per i campi anagrafici).
export interface Company {
  id: string;
  name: string;
  ownerId: string;
  // Tutti null finché l'owner non li compila dal drawer "Modifica dati
  // aziendali": nessuno di questi dati esiste per le aziende registrate prima
  // di 0030 (vedi commento della migration).
  ragioneSociale: string | null;
  piva: string | null;
  codiceFiscale: string | null;
  indirizzo: string | null;
  pec: string | null;
  // Prerequisiti per la futura pre-fatturazione (0033, vedi .tasks/TASK.md):
  // stessa logica "null finché l'owner non li compila" dei campi anagrafici
  // sopra. tariffaUnita è null se e solo se tariffaOraria è null (accoppiati
  // dal controller, mai scritti in stato incoerente).
  tariffaOraria: number | null;
  tariffaUnita: RateUnit | null;
  // Valuta base dell'azienda (0043): obbligatoria e sempre valorizzata, a
  // differenza di tariffaOraria/tariffaUnita sopra — un'azienda opera sempre
  // in un'unica valuta, mai null. Un cliente può sovrascriverla (vedi
  // Customer.valuta in models/customer.ts), altrimenti una pre-fattura la
  // eredita da qui.
  valuta: CurrencyCode;
  giorniLavorativi: WorkDays;
  orarioLavoro: WorkHours;
  createdAt: string;
}
