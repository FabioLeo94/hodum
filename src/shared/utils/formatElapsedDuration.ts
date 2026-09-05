// Formato "giorni?:ore?:minuti?:secondi" richiesto per il timer di
// lavorazione dei task: le unità superiori (giorni, ore, minuti) compaiono
// solo se non sono a zero; una volta comparsa un'unità superiore, tutte le
// unità inferiori sono sempre mostrate a due cifre (comportamento standard di
// un cronometro, es. 1:30, 1:01:05, 2:00:03:15). Nessuna unità di misura
// testuale né dipendenza da i18n: solo cifre e ":".
export function formatElapsedDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(safeSeconds / 86400);
  const hours = Math.floor((safeSeconds % 86400) / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  const showDays = days > 0;
  const showHours = showDays || hours > 0;
  const showMinutes = showHours || minutes > 0;

  const pad = (value: number) => String(value).padStart(2, "0");
  const segments: string[] = [];
  if (showDays) segments.push(String(days));
  if (showHours) segments.push(showDays ? pad(hours) : String(hours));
  if (showMinutes) segments.push(showHours ? pad(minutes) : String(minutes));
  segments.push(showMinutes ? pad(seconds) : String(seconds));

  return segments.join(":");
}
