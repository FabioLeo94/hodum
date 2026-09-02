import type { Request as ExRequest } from 'express';
import { Body, Controller, Delete, Get, Path, Post, Put, Request, Response, Route, Security, SuccessResponse } from 'tsoa';
import { getAuthenticatedUser } from '../middleware/authentication';
import type { TaskComment } from '../models/taskComment';
import {
  CommentNotFoundError,
  createComment,
  deleteComment,
  listCommentsByTask,
  ProjectNotFoundError,
  TaskNotFoundError,
  updateComment,
} from '../services/taskCommentService';
import { assertProjectAccessible } from '../services/projectAssignmentService';

// Nome distinto da "TaskErrorResponse" di taskController.ts: tsoa risolve i
// modelli per nome dell'interfaccia a livello globale (non per file), quindi
// due interfacce omonime in controller diversi collidono in generazione.
interface TaskCommentErrorResponse {
  message: string;
}

export interface CreateTaskCommentRequest {
  body: string;
}

// Stessa forma di CreateTaskCommentRequest ma interfaccia distinta (non
// riutilizzata): a differenza di UpdateTaskRequest in taskController.ts, qui
// il campo non è opzionale (un PUT sul commento riscrive sempre l'intero
// body, non lo aggiorna parzialmente), quindi la duplicazione documenta
// l'intento invece di essere solo rumore.
export interface UpdateTaskCommentRequest {
  body: string;
}

// Stesso prefisso 'projects' di TaskController: la risorsa commento è
// annidata sotto un task, a sua volta annidato sotto un progetto
// (/projects/{projectId}/tasks/{taskId}/comments).
@Route('projects')
export class TaskCommentController extends Controller {
  @Get('{projectId}/tasks/{taskId}/comments')
  @Security('jwt')
  @Response<TaskCommentErrorResponse>(404, 'Project o task non trovato')
  public async listTaskComments(
    @Path() projectId: string,
    @Path() taskId: string,
    @Request() request: ExRequest,
  ): Promise<TaskComment[] | TaskCommentErrorResponse> {
    const user = getAuthenticatedUser(request);
    try {
      await assertProjectAccessible(projectId, user);
      return await listCommentsByTask(projectId, taskId, user.companyId);
    } catch (err) {
      if (err instanceof TaskNotFoundError || err instanceof ProjectNotFoundError) {
        this.setStatus(404);
        return { message: err.message };
      }
      throw err;
    }
  }

  @Post('{projectId}/tasks/{taskId}/comments')
  @Security('jwt')
  @SuccessResponse(201, 'Commento creato')
  @Response<TaskCommentErrorResponse>(404, 'Project o task non trovato')
  @Response<TaskCommentErrorResponse>(422, 'body vuoto')
  public async createTaskComment(
    @Path() projectId: string,
    @Path() taskId: string,
    @Body() body: CreateTaskCommentRequest,
    @Request() request: ExRequest,
  ): Promise<TaskComment | TaskCommentErrorResponse> {
    // Stesso pattern di createTask in taskController.ts: tsoa valida che
    // "body" sia una stringa (campo non opzionale), ma non che non sia vuota
    // dopo trim, è una regola di dominio e resta responsabilità del controller.
    if (body.body.trim().length === 0) {
      this.setStatus(422);
      return { message: 'il commento non può essere vuoto' };
    }

    const user = getAuthenticatedUser(request);
    try {
      await assertProjectAccessible(projectId, user);
      const comment = await createComment(projectId, taskId, user.id, body.body, user.companyId);
      this.setStatus(201);
      return comment;
    } catch (err) {
      if (err instanceof TaskNotFoundError || err instanceof ProjectNotFoundError) {
        this.setStatus(404);
        return { message: err.message };
      }
      throw err;
    }
  }

  @Put('{projectId}/tasks/{taskId}/comments/{commentId}')
  @Security('jwt')
  @Response<TaskCommentErrorResponse>(404, 'Project, task o commento non trovato')
  @Response<TaskCommentErrorResponse>(422, 'body vuoto')
  public async updateTaskComment(
    @Path() projectId: string,
    @Path() taskId: string,
    @Path() commentId: string,
    @Body() body: UpdateTaskCommentRequest,
    @Request() request: ExRequest,
  ): Promise<TaskComment | TaskCommentErrorResponse> {
    if (body.body.trim().length === 0) {
      this.setStatus(422);
      return { message: 'il commento non può essere vuoto' };
    }

    const user = getAuthenticatedUser(request);
    try {
      await assertProjectAccessible(projectId, user);
      // AuthorizationError (autore diverso dal richiedente) non viene
      // intercettato qui: bubble fino all'error handler globale (app.ts), che
      // la traduce in 403, stesso trattamento riservato ai controlli di ruolo
      // in expressAuthentication.
      return await updateComment(projectId, taskId, commentId, user.id, body.body, user.companyId);
    } catch (err) {
      if (err instanceof TaskNotFoundError || err instanceof ProjectNotFoundError || err instanceof CommentNotFoundError) {
        this.setStatus(404);
        return { message: err.message };
      }
      throw err;
    }
  }

  @Delete('{projectId}/tasks/{taskId}/comments/{commentId}')
  @Security('jwt')
  @SuccessResponse(204, 'Commento eliminato')
  @Response<TaskCommentErrorResponse>(404, 'Project, task o commento non trovato')
  public async deleteTaskComment(
    @Path() projectId: string,
    @Path() taskId: string,
    @Path() commentId: string,
    @Request() request: ExRequest,
  ): Promise<void> {
    const user = getAuthenticatedUser(request);
    try {
      await assertProjectAccessible(projectId, user);
      await deleteComment(projectId, taskId, commentId, user.id, user.companyId);
      this.setStatus(204);
    } catch (err) {
      if (err instanceof TaskNotFoundError || err instanceof ProjectNotFoundError || err instanceof CommentNotFoundError) {
        this.setStatus(404);
        return;
      }
      throw err;
    }
  }
}
