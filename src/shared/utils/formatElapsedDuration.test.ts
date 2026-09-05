import { describe, it, expect } from "vitest";
import { formatElapsedDuration } from "./formatElapsedDuration";

describe("formatElapsedDuration", () => {
  it("mostra solo i secondi quando sotto al minuto", () => {
    expect(formatElapsedDuration(0)).toBe("0");
    expect(formatElapsedDuration(45)).toBe("45");
  });

  it("mostra minuti:secondi quando sotto all'ora", () => {
    expect(formatElapsedDuration(90)).toBe("1:30");
    expect(formatElapsedDuration(59 * 60 + 5)).toBe("59:05");
  });

  it("mostra ore:minuti:secondi quando sotto al giorno", () => {
    expect(formatElapsedDuration(3661)).toBe("1:01:01");
  });

  it("mostra giorni:ore:minuti:secondi oltre al giorno", () => {
    // 1 giorno, 1 ora, 0 minuti, 3 secondi
    expect(formatElapsedDuration(86400 + 3600 + 3)).toBe("1:01:00:03");
  });

  it("tronca i secondi frazionari e non va mai sotto zero", () => {
    expect(formatElapsedDuration(12.9)).toBe("12");
    expect(formatElapsedDuration(-5)).toBe("0");
  });
});
