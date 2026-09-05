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

// Errore di dominio condiviso da ogni service per "campo non valido dopo
// normalizzazione" (vuoto dopo trim, fuori range, formato non ammesso...): lo
// stesso pattern per campo, ripetuto identico in una decina di controller
// (createProject, updateProject, createTaskComment, updateUser, register,
// createEmployee, putSettings...), mai delegato al service. Mappato una sola
// volta nell'error handler globale (app.ts) a 422, invece che in ogni
// controller: a differenza di TaskLockedError in taskController.ts (che resta
// nel controller perché lì serve this.setStatus di tsoa su un errore
// specifico di UNA rotta), questa è una regola trasversale a qualunque
// scrittura, quindi appartiene al livello generico Express.
export class ValidationError extends Error {
  constructor(
    public readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

// Messaggio di default "<field> non può essere vuoto": copre la maggioranza
// dei casi (name, username...). Un terzo parametro esplicito serve solo dove
// il nome del campo nel messaggio non coincide col nome tecnico (es. "body"
// del commento, mostrato all'utente come "il commento").
export function assertNonEmpty(value: string, field: string, message = `${field} non può essere vuoto`): void {
  if (value.trim().length === 0) {
    throw new ValidationError(field, message);
  }
}

// Caso generico (range numerici, pattern non testuali) per cui assertNonEmpty
// non si applica: stessa ValidationError, stesso mapping a 422, il chiamante
// fornisce la condizione già valutata e il messaggio.
export function assertValid(condition: boolean, field: string, message: string): void {
  if (!condition) {
    throw new ValidationError(field, message);
  }
}
