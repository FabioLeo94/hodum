// Condiviso da editEmployeeModal, editAccountModal e topbar: gli unici punti
// che mostrano createdAt/lastLoginAt (entrambi ISO 8601 lato User, vedi
// authService.ts), sempre in sola lettura e sempre nello stesso formato
// italiano, quindi centralizzato qui invece di richiamare toLocaleString
// separatamente in ogni componente.
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", { dateStyle: "medium" });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" });
}
