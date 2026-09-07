// Scompone un totale di secondi nei quattro segmenti canonici di un
// cronometro (giorni, ore, minuti, secondi) come numeri grezzi, senza
// padding: usata dai badge a 4 segmenti sempre visibili (taskWorkTimerComponent
// e elapsedDurationBadgeComponent), che decidono da sé il padding a due cifre
// e l'attenuazione visiva dei segmenti a zero.
export interface ElapsedDurationSegments {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export function decomposeElapsedDuration(totalSeconds: number): ElapsedDurationSegments {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  return {
    days: Math.floor(safeSeconds / 86400),
    hours: Math.floor((safeSeconds % 86400) / 3600),
    minutes: Math.floor((safeSeconds % 3600) / 60),
    seconds: safeSeconds % 60,
  };
}
