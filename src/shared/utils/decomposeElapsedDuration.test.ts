import { describe, it, expect } from "vitest";
import { decomposeElapsedDuration } from "./decomposeElapsedDuration";

describe("decomposeElapsedDuration", () => {
  it("restituisce tutti i segmenti a zero quando il totale è zero", () => {
    expect(decomposeElapsedDuration(0)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  });

  it("scompone solo i secondi quando sotto al minuto", () => {
    expect(decomposeElapsedDuration(45)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 45 });
  });

  it("scompone minuti e secondi quando sotto all'ora", () => {
    expect(decomposeElapsedDuration(90)).toEqual({ days: 0, hours: 0, minutes: 1, seconds: 30 });
  });

  it("scompone ore, minuti e secondi quando sotto al giorno", () => {
    expect(decomposeElapsedDuration(3661)).toEqual({ days: 0, hours: 1, minutes: 1, seconds: 1 });
  });

  it("scompone anche i giorni oltre le 24 ore", () => {
    // 1 giorno, 1 ora, 0 minuti, 3 secondi
    expect(decomposeElapsedDuration(86400 + 3600 + 3)).toEqual({
      days: 1,
      hours: 1,
      minutes: 0,
      seconds: 3,
    });
  });

  it("tronca i secondi frazionari e non va mai sotto zero", () => {
    expect(decomposeElapsedDuration(12.9)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 12 });
    expect(decomposeElapsedDuration(-5)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  });
});
