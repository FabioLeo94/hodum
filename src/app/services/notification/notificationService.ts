import type { NotificationType } from "../realtime/socketService";
import { authFetch, authHeader } from "../auth/authService";
import { API_BASE_URL, readErrorMessage } from "../httpClient";

// Stessa forma del DTO ricevuto via socket (NotificationEventDto): nessuna
// funzione toNotification, a differenza di toTask/toProject, perché qui non
// c'è alcun campo da scartare o da rendere non-null con un default.
export interface Notification {
  id: string;
  type: NotificationType;
  read: boolean;
  createdAt: string;
  projectId: string | null;
  projectName: string | null;
  taskId: string | null;
  taskTitle: string | null;
  commentId: string | null;
  actorId: string | null;
  actorUsername: string | null;
  dueDate: string | null;
}

export interface NotificationList {
  items: Notification[];
  unreadCount: number;
}

export async function listNotifications(): Promise<NotificationList> {
  const response = await authFetch(`${API_BASE_URL}/notifications`, { headers: authHeader() });
  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message ?? "Impossibile caricare le notifiche.");
  }
  return (await response.json()) as NotificationList;
}

export async function markNotificationRead(id: string): Promise<void> {
  const response = await authFetch(`${API_BASE_URL}/notifications/${id}/read`, {
    method: "PATCH",
    headers: authHeader(),
  });
  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message ?? "Impossibile segnare la notifica come letta.");
  }
}

export async function markAllNotificationsRead(): Promise<void> {
  const response = await authFetch(`${API_BASE_URL}/notifications/read-all`, {
    method: "PATCH",
    headers: authHeader(),
  });
  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message ?? "Impossibile segnare tutte le notifiche come lette.");
  }
}
