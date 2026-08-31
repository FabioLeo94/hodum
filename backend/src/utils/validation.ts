// Stessa forma richiesta lato frontend (vedi validationService.ts): non RFC
// completa, ma scarta i casi palesemente sbagliati prima del vincolo UNIQUE
// del DB, con lo stesso standard applicato client-side.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

// Stessa policy applicata lato frontend in validationService.ts: replicata
// qui perché chi chiama l'API direttamente deve rispettare lo stesso
// standard, non solo chi passa dalla UI. Condivisa tra userController.ts
// (self-service) e companyController.ts (registrazione azienda + owner):
// stesso standard indipendentemente da quale flusso crea l'utente.
const PASSWORD_MIN_LENGTH = 8;

export function isValidPassword(password: string): boolean {
  return (
    password.length >= PASSWORD_MIN_LENGTH &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password)
  );
}

export const PASSWORD_POLICY_MESSAGE =
  'password deve avere almeno 8 caratteri, con almeno una maiuscola, una minuscola e un numero';
