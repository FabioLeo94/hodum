import { randomInt } from 'node:crypto';

// Alfabeto senza 0/O, 1/I/L e vocali ambigue: un codice che l'owner deve
// ricopiare a mano da un foglio/gestore password non deve poter fallire per
// una confusione visiva tra caratteri, lo stesso principio di un codice OTP
// leggibile.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const GROUP_LENGTH = 4;
const GROUP_COUNT = 4;

// Formato "XXXX-XXXX-XXXX-XXXX": 16 caratteri utili da un alfabeto di 32 ->
// 16 * log2(32) = 80 bit di entropia. Enormemente sopra quanto serve contro
// un brute-force già rate-limitato (vedi /auth/recover-password in app.ts),
// con ampio margine anche se in futuro cambiasse il cost factor bcrypt.
export function generateRecoveryCode(): string {
  const groups: string[] = [];
  for (let g = 0; g < GROUP_COUNT; g++) {
    let group = '';
    for (let i = 0; i < GROUP_LENGTH; i++) {
      group += ALPHABET[randomInt(ALPHABET.length)];
    }
    groups.push(group);
  }
  return groups.join('-');
}

// Il valore effettivamente hashato/confrontato è sempre la forma normalizzata
// (senza trattini, maiuscola): i trattini nel formato generato sono solo
// cosmetici per la leggibilità, e l'owner che lo ricopia a mano non deve
// fallire il confronto per differenze di spaziatura/maiuscole/trattini.
export function normalizeRecoveryCode(input: string): string {
  return input.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}
