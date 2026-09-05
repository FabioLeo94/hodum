// Estratta da invoiceService.ts, dove la stessa formula (`Math.round(x * 100)
// / 100`, arrotonda a 2 decimali evitando le code binarie della virgola
// mobile, es. 0.1 + 0.2) era ripetuta identica in più punti: sia per importi
// in euro (i "centesimi" del nome) sia per un totale di ore mostrato con la
// stessa precisione a 2 decimali — un'unica implementazione invece di
// ripeterla ogni volta, con il rischio che una copia diverga dall'altra.
export function roundToCents(value: number): number {
  return Math.round(value * 100) / 100;
}
