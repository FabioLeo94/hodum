// Estratta da taskService.ts (dove viveva accanto a TASK_SELECT) perché ora
// serve anche a notificationService.ts (notifications.due_date è la stessa
// colonna `date`, letta con lo stesso problema di fuso orario): tenerla qui
// evita un import circolare taskService <-> notificationService (taskService
// chiama notifyProjectTeam dopo l'insert di un task, notificationService
// formatterebbe altrimenti importando da taskService).
//
// Mai toISOString() (converte a UTC, può far slittare il giorno secondo il
// fuso orario del server) né toLocaleDateString() (locale-dipendente): solo
// getter locali, simmetrico al parsing lato frontend (src/shared/utils/
// taskDueDate.ts).
export function formatDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
