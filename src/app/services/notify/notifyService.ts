// Store dei toast di sistema (notifyComponent.tsx): distinto da
// services/notification, che sono le notifiche persistite lato server
// mostrate nel campanello del topbar. Qui non c'è nulla da persistere né da
// recuperare al mount: è un canale volatile, pensato per essere chiamato da
// qualunque punto del codice (componenti, service, catch di una fetch) senza
// dover passare da un hook o da un Context — coerente con gli altri service
// del progetto, che sono funzioni semplici e non richiedono di stare dentro
// l'albero React per essere usati.
export type NotifyType = "success" | "error" | "info" | "warning";

export interface NotifyToast {
  id: string;
  type: NotifyType;
  message: string;
}

type Listener = (toasts: NotifyToast[]) => void;

let toasts: NotifyToast[] = [];
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((listener) => listener(toasts));
}

// Stesso pattern subscribe/unsubscribe di subscribeToNotifications in
// socketService: chiama subito il listener con lo stato corrente, così un
// NotifyComponent montato dopo che un toast è già stato accodato (es. durante
// una navigazione) non perde nulla.
export function subscribeToToasts(listener: Listener): () => void {
  listeners.add(listener);
  listener(toasts);
  return () => {
    listeners.delete(listener);
  };
}

function pushToast(type: NotifyType, message: string) {
  const id = crypto.randomUUID();
  toasts = [...toasts, { id, type, message }];
  emit();
}

// Chiamata da NotifyComponent a fine animazione di uscita: la scomparsa dopo
// 5 secondi e la relativa animazione sono responsabilità del componente, non
// dello store, per poter mostrare la transizione prima di rimuovere il toast
// dall'array.
export function dismissToast(id: string) {
  toasts = toasts.filter((toast) => toast.id !== id);
  emit();
}

export function notifySuccess(message: string) {
  pushToast("success", message);
}

export function notifyError(message: string) {
  pushToast("error", message);
}

export function notifyInfo(message: string) {
  pushToast("info", message);
}

export function notifyWarning(message: string) {
  pushToast("warning", message);
}
