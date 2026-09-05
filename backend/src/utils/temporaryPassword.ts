import { randomInt } from 'node:crypto';

// A differenza di recoveryCode.ts (alfabeto senza minuscole, pensato per
// essere ricopiato a mano da un foglio), una password temporanea generata da
// importCompanyData (companyService.ts) deve solo soddisfare isValidPassword
// (utils/validation.ts: minimo 8 caratteri, almeno una maiuscola, una
// minuscola, una cifra) e viene letta a schermo una sola volta prima del
// primo cambio password obbligatorio (must_change_password = true) — da qui
// un alfabeto più ampio invece di riadattare quello del recovery code.
const UPPER = 'ABCDEFGHJKMNPQRSTUVWXYZ';
const LOWER = 'abcdefghjkmnpqrstuvwxyz';
const DIGITS = '23456789';
const ALL = UPPER + LOWER + DIGITS;
const LENGTH = 12;

// Piazza una maiuscola, una minuscola e una cifra nelle prime tre posizioni
// (garanzia dei tre requisiti di isValidPassword), riempie il resto
// dall'alfabeto completo, poi mischia l'ordine con un Fisher-Yates: senza
// l'ultimo passo le prime tre posizioni sarebbero sempre nello stesso ordine
// maiuscola-minuscola-cifra, un pattern riconoscibile che riduce l'entropia
// effettiva della password generata.
export function generateTemporaryPassword(): string {
  const chars = [UPPER[randomInt(UPPER.length)], LOWER[randomInt(LOWER.length)], DIGITS[randomInt(DIGITS.length)]];
  for (let i = chars.length; i < LENGTH; i++) {
    chars.push(ALL[randomInt(ALL.length)]);
  }
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
