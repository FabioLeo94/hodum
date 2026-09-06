// Regola di business unica per "come mostrare un utente" ovunque nel
// frontend un User pieno (username + firstName/lastName) sia disponibile:
// username se presente (non null, non vuoto dopo trim), altrimenti "nome
// cognome". Il backend applica lo stesso fallback via SQL per le entità già
// denormalizzate (TaskAssignee.displayName, TaskComment.authorDisplayName,
// Notification.actorDisplayName): quei campi arrivano già pronti e NON vanno
// passati qui, che serve solo dove firstName/lastName sono ancora disponibili
// separatamente (topbar, elenco dipendenti, form di modifica, selettori
// assegnatari basati su User).
export function getDisplayName(user: {
  username: string | null;
  firstName: string;
  lastName: string;
}): string {
  return user.username?.trim() || `${user.firstName} ${user.lastName}`;
}
