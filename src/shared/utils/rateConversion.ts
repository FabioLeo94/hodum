// Stessi 5 valori del CHECK su companies.tariffa_unita/customers.tariffa_unita
// lato backend (vedi backend/src/models/company.ts): l'unità è solo per la
// visualizzazione/inserimento lato frontend, il valore canonico scambiato con
// l'API resta sempre tariffaOraria in €/ora.
export type RateUnit = "oraria" | "giornaliera" | "settimanale" | "mensile" | "annuale";

// Ordine di visualizzazione nella dropdown, dalla granularità più piccola
// alla più grande.
export const RATE_UNITS: readonly RateUnit[] = [
  "oraria",
  "giornaliera",
  "settimanale",
  "mensile",
  "annuale",
];

// Stessa forma di WorkDays in backend/src/models/company.ts.
export interface WorkDays {
  lunedi: boolean;
  martedi: boolean;
  mercoledi: boolean;
  giovedi: boolean;
  venerdi: boolean;
  sabato: boolean;
  domenica: boolean;
}

// Stessa forma di WorkHours in backend/src/models/company.ts: continuativo
// true => inizio1/fine1 è l'unica fascia (apertura/chiusura), false =>
// inizio1/fine1 è la fascia mattutina e inizio2/fine2 quella pomeridiana.
export interface WorkHours {
  continuativo: boolean;
  inizio1: string | null;
  fine1: string | null;
  inizio2: string | null;
  fine2: string | null;
}

// Media fissa (non il calendario reale del mese/anno corrente): un valore
// stabile che non cambia da solo cambiando giorno (un 30 novembre avrebbe un
// fattore mensile diverso da un 31 dicembre a parità di tariffa oraria,
// confondendo l'utente più di quanto lo aiuterebbe la precisione in più).
export const WEEKS_PER_MONTH = 52 / 12;
export const WEEKS_PER_YEAR = 52;

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

// Durata della giornata lavorativa in ore: fascia1 sempre, + fascia2 se non
// continuativo (pausa nel mezzo, es. pranzo). 0 se inizio1/fine1 non sono
// impostati (nessun orario configurato).
export function getWorkHoursPerDay(workHours: WorkHours): number {
  if (!workHours.inizio1 || !workHours.fine1) return 0;
  let minutes = timeToMinutes(workHours.fine1) - timeToMinutes(workHours.inizio1);
  if (!workHours.continuativo && workHours.inizio2 && workHours.fine2) {
    minutes += timeToMinutes(workHours.fine2) - timeToMinutes(workHours.inizio2);
  }
  return minutes / 60;
}

export function countWorkDays(workDays: WorkDays): number {
  return Object.values(workDays).filter(Boolean).length;
}

// True solo se il calcolo di ore/settimana produce un numero utilizzabile
// (almeno un giorno selezionato E almeno un'ora al giorno): serve a decidere
// se le unità diverse da "oraria" sono selezionabili nella UI, altrimenti la
// conversione darebbe sempre 0 in modo silenzioso e poco comprensibile.
export function isScheduleConfigured(workDays: WorkDays, workHours: WorkHours): boolean {
  return countWorkDays(workDays) > 0 && getWorkHoursPerDay(workHours) > 0;
}

// fattore(unità) = quante ore equivalgono a 1 unità, usato per passare sempre
// dall'orario canonico. giornaliera dipende solo dalle ore/giorno (non dal
// numero di giorni selezionati): una tariffa "al giorno" ha senso anche prima
// di aver scelto quali giorni si lavora. settimanale/mensile/annuale invece
// dipendono anche dai giorni selezionati.
function rateFactor(unit: RateUnit, workDays: WorkDays, workHours: WorkHours): number {
  const hoursPerDay = getWorkHoursPerDay(workHours);
  const hoursPerWeek = hoursPerDay * countWorkDays(workDays);
  switch (unit) {
    case "oraria":
      return 1;
    case "giornaliera":
      return hoursPerDay;
    case "settimanale":
      return hoursPerWeek;
    case "mensile":
      return hoursPerWeek * WEEKS_PER_MONTH;
    case "annuale":
      return hoursPerWeek * WEEKS_PER_YEAR;
  }
}

// Converte `value` (espresso in fromUnit) in toUnit, passando sempre per
// l'orario canonico. Calcolo puro usato in una UI reattiva (RateInputComponent),
// non un boundary di sistema: se lo schedule non è configurato per una delle
// due unità (fattore 0), ritorna 0 invece di NaN/Infinity, così il campo mostra
// un valore innocuo invece di propagare un errore silenzioso nel render.
export function convertRate(
  value: number,
  fromUnit: RateUnit,
  toUnit: RateUnit,
  workDays: WorkDays,
  workHours: WorkHours,
): number {
  const fromFactor = rateFactor(fromUnit, workDays, workHours);
  const toFactor = rateFactor(toUnit, workDays, workHours);
  if (fromFactor === 0 || toFactor === 0) return 0;
  return (value / fromFactor) * toFactor;
}
