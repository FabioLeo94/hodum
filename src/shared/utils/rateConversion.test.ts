import { describe, it, expect } from "vitest";
import {
  convertRate,
  countWorkDays,
  getWorkHoursPerDay,
  isScheduleConfigured,
  type WorkDays,
  type WorkHours,
} from "./rateConversion";

// Lun-Ven, 9-13 e 14-18 (pausa pranzo): 8 ore/giorno, 5 giorni/settimana.
const FULL_WEEK_DAYS: WorkDays = {
  lunedi: true,
  martedi: true,
  mercoledi: true,
  giovedi: true,
  venerdi: true,
  sabato: false,
  domenica: false,
};
const SPLIT_HOURS: WorkHours = {
  continuativo: false,
  inizio1: "09:00",
  fine1: "13:00",
  inizio2: "14:00",
  fine2: "18:00",
};

const NO_DAYS: WorkDays = {
  lunedi: false,
  martedi: false,
  mercoledi: false,
  giovedi: false,
  venerdi: false,
  sabato: false,
  domenica: false,
};
const NO_HOURS: WorkHours = {
  continuativo: true,
  inizio1: null,
  fine1: null,
  inizio2: null,
  fine2: null,
};

describe("rateConversion", () => {
  it("calcola le ore/giorno e i giorni selezionati per uno schedule con pausa pranzo", () => {
    expect(getWorkHoursPerDay(SPLIT_HOURS)).toBe(8);
    expect(countWorkDays(FULL_WEEK_DAYS)).toBe(5);
    expect(isScheduleConfigured(FULL_WEEK_DAYS, SPLIT_HOURS)).toBe(true);
  });

  it("converte oraria -> giornaliera -> settimanale -> mensile -> annuale e viceversa", () => {
    // 10 €/ora, 8 ore/giorno, 5 giorni/settimana => 80 €/giorno, 400 €/settimana.
    expect(convertRate(10, "oraria", "giornaliera", FULL_WEEK_DAYS, SPLIT_HOURS)).toBe(80);
    expect(convertRate(80, "giornaliera", "settimanale", FULL_WEEK_DAYS, SPLIT_HOURS)).toBe(400);
    expect(convertRate(400, "settimanale", "oraria", FULL_WEEK_DAYS, SPLIT_HOURS)).toBe(10);

    // Mensile/annuale passano per la media fissa (52/12 e 52 settimane).
    expect(convertRate(10, "oraria", "mensile", FULL_WEEK_DAYS, SPLIT_HOURS)).toBeCloseTo(
      400 * (52 / 12),
      6,
    );
    expect(convertRate(10, "oraria", "annuale", FULL_WEEK_DAYS, SPLIT_HOURS)).toBe(400 * 52);
    expect(
      convertRate(400 * 52, "annuale", "oraria", FULL_WEEK_DAYS, SPLIT_HOURS),
    ).toBeCloseTo(10, 6);
  });

  it("usa una sola fascia quando continuativo è true, ignorando inizio2/fine2", () => {
    const continuousHours: WorkHours = {
      continuativo: true,
      inizio1: "09:00",
      fine1: "17:00",
      // Valorizzate ma non significative: continuativo=true deve ignorarle.
      inizio2: "20:00",
      fine2: "22:00",
    };
    expect(getWorkHoursPerDay(continuousHours)).toBe(8);
    expect(convertRate(10, "oraria", "giornaliera", FULL_WEEK_DAYS, continuousHours)).toBe(80);
  });

  it("considera lo schedule non configurato quando mancano gli orari, e la conversione ritorna 0 per unità non orarie", () => {
    expect(isScheduleConfigured(FULL_WEEK_DAYS, NO_HOURS)).toBe(false);
    expect(convertRate(10, "oraria", "giornaliera", FULL_WEEK_DAYS, NO_HOURS)).toBe(0);
    expect(convertRate(10, "oraria", "settimanale", FULL_WEEK_DAYS, NO_HOURS)).toBe(0);
    expect(convertRate(10, "oraria", "mensile", FULL_WEEK_DAYS, NO_HOURS)).toBe(0);
    expect(convertRate(10, "oraria", "annuale", FULL_WEEK_DAYS, NO_HOURS)).toBe(0);
  });

  it("considera lo schedule non configurato quando manca almeno un giorno, e la conversione a settimanale/mensile/annuale ritorna 0", () => {
    expect(isScheduleConfigured(NO_DAYS, SPLIT_HOURS)).toBe(false);
    // giornaliera dipende solo dalle ore/giorno, non dal numero di giorni
    // selezionati: resta calcolabile anche senza nessun giorno scelto.
    expect(convertRate(10, "oraria", "giornaliera", NO_DAYS, SPLIT_HOURS)).toBe(80);
    expect(convertRate(10, "oraria", "settimanale", NO_DAYS, SPLIT_HOURS)).toBe(0);
    expect(convertRate(10, "oraria", "annuale", NO_DAYS, SPLIT_HOURS)).toBe(0);
  });
});
