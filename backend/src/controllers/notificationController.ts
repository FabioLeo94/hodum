import type { Request as ExRequest } from 'express';
import { Controller, Get, Patch, Path, Request, Response, Route, Security } from 'tsoa';
import { getAuthenticatedUser } from '../middleware/authentication';
import type { Notification } from '../models/notification';
import { listForUser, markAllAsRead, markAsRead, NotificationNotFoundError } from '../services/notificationService';

// Nome distinto dagli omonimi "ErrorResponse" degli altri controller: tsoa
// risolve i modelli per nome dell'interfaccia a livello globale (non per
// file), quindi collidono in generazione se condivisi.
interface NotificationErrorResponse {
  message: string;
}

export interface NotificationListResponse {
  items: Notification[];
  unreadCount: number;
}

// Route di primo livello, NON annidata sotto 'projects' come TaskController/
// TaskCommentController: le notifiche sono per-utente e trasversali ai
// progetti (un utente vede le proprie indipendentemente da quale progetto le
// ha generate), non una risorsa figlia di uno specifico progetto.
@Route('notifications')
export class NotificationController extends Controller {
  @Get()
  @Security('jwt')
  public async listNotifications(@Request() request: ExRequest): Promise<NotificationListResponse> {
    const user = getAuthenticatedUser(request);
    return listForUser(user.id);
  }

  @Patch('{id}/read')
  @Security('jwt')
  @Response<NotificationErrorResponse>(404, 'Notifica non trovata')
  public async markNotificationAsRead(
    @Path() id: string,
    @Request() request: ExRequest,
  ): Promise<void | NotificationErrorResponse> {
    const user = getAuthenticatedUser(request);
    try {
      // markAsRead filtra anche su user_id: un id di una notifica altrui
      // risulta "0 righe modificate" qui, indistinguibile da un id
      // inesistente (stesso 404 in entrambi i casi, non un 403 che
      // confermerebbe l'esistenza della notifica di un altro utente).
      await markAsRead(id, user.id);
    } catch (err) {
      if (err instanceof NotificationNotFoundError) {
        this.setStatus(404);
        return { message: err.message };
      }
      throw err;
    }
  }

  @Patch('read-all')
  @Security('jwt')
  public async markAllNotificationsAsRead(@Request() request: ExRequest): Promise<void> {
    const user = getAuthenticatedUser(request);
    await markAllAsRead(user.id);
  }
}
