import type { Request as ExRequest } from 'express';
import { Body, Controller, Delete, Get, Patch, Path, Post, Put, Request, Response, Route, Security, SuccessResponse } from '@tsoa/runtime';
import { getAuthenticatedUser } from '../middleware/authentication';
import type { Task, TaskStatus } from '../models/task';
import {
  createTask,
  deleteTask,
  isValidAccumulatedSeconds,
  isValidDueDate,
  isValidPriority,
  isValidTaskStatus,
  isValidWorkTimerAction,
  listTasksByProject,
  ProjectNotFoundError,
  setTaskAssignees,
  TaskLockedError,
  TaskNotFoundError,
  updateTask,
  updateTaskElapsedTime,
  updateTaskPriority,
  updateTaskStatus,
  updateTaskWorkTimer,
  type WorkTimerAction,
} from '../services/taskService';
import { assertProjectAccessible } from '../services/projectAssignmentService';
import { UserNotFoundError } from '../services/userService';

// Nome distinto da "ErrorResponse" di projectController.ts: tsoa risolve i
// modelli per nome dell'interfaccia a livello globale (non per file), quindi
// due interfacce omonime in controller diversi collidono in generazione.
interface TaskErrorResponse {
  message: string;
}

export interface CreateTaskRequest {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: number;
  dueDate?: string | null;
  assigneeIds?: string[];
}

export interface UpdateTaskStatusRequest {
  status: TaskStatus;
}

export interface UpdateTaskPriorityRequest {
  priority: number;
}

export interface UpdateTaskWorkTimerRequest {
  action: WorkTimerAction;
}

export interface UpdateTaskElapsedTimeRequest {
  workAccumulatedSeconds: number;
}

export interface UpdateTaskRequest {
  title?: string;
  description?: string;
  dueDate?: string | null;
}

export interface UpdateTaskAssigneesRequest {
  userIds: string[];
}

// Stesso prefisso 'projects' di ProjectController: la risorsa task è
// annidata sotto un progetto (/projects/{projectId}/tasks), non una risorsa
// di primo livello.
@Route('projects')
export class TaskController extends Controller {
  // Punto 4 della code review "niente logica nei controller": lo stesso
  // blocco `if (err instanceof TaskLockedError) { this.setStatus(409);
  // return {...}; }` era ripetuto identico in 6 metodi (updateTask,
  // updateTaskStatus, updateTaskPriority, updateTaskWorkTimer, deleteTask,
  // updateTaskAssignees). Resta un metodo di classe (non spostato nell'error
  // handler globale di app.ts come il punto 2): richiede this.setStatus,
  // specifico di tsoa su QUESTO controller, non una regola trasversale a
  // qualunque scrittura. Privato e senza decoratori HTTP: tsoa genera le
  // rotte solo dai metodi con un decoratore (@Get/@Post/...), quindi non
  // interferisce con tsoa:gen. Restituisce undefined se err non è
  // TaskLockedError, lasciando al chiamante il compito di rilanciarlo.
  private mapTaskLockedError(err: unknown): TaskErrorResponse | undefined {
    if (err instanceof TaskLockedError) {
      this.setStatus(409);
      return { message: err.message };
    }
    return undefined;
  }

  @Get('{projectId}/tasks')
  @Security('jwt')
  @Response<TaskErrorResponse>(404, 'Project non trovato')
  public async listProjectTasks(
    @Path() projectId: string,
    @Request() request: ExRequest,
  ): Promise<Task[] | TaskErrorResponse> {
    const user = getAuthenticatedUser(request);
    try {
      await assertProjectAccessible(projectId, user);
      return await listTasksByProject(projectId, user.companyId);
    } catch (err) {
      if (err instanceof ProjectNotFoundError) {
        this.setStatus(404);
        return { message: err.message };
      }
      throw err;
    }
  }

  @Post('{projectId}/tasks')
  @Security('jwt')
  @SuccessResponse(201, 'Task creato')
  @Response<TaskErrorResponse>(404, 'Project non trovato')
  @Response<TaskErrorResponse>(422, 'title vuoto, priority, status o dueDate non validi')
  public async createTask(
    @Path() projectId: string,
    @Body() body: CreateTaskRequest,
    @Request() request: ExRequest,
  ): Promise<Task | TaskErrorResponse> {
    // "title" vuoto è validato da taskService.createTask (ValidationError,
    // mappata a 422 dall'error handler globale in app.ts): a differenza di
    // priority/status/dueDate sotto, non richiede lo stato del progetto per
    // essere verificato, ma resta nel service insieme all'unica altra regola
    // di dominio della stessa funzione (project esistente), invece di essere
    // sparsa tra controller e service.
    // Stessa validazione e stesso messaggio dell'endpoint PATCH priority: la
    // regola di dominio è la stessa, cambia solo il momento in cui si applica.
    if (body.priority !== undefined && !isValidPriority(body.priority)) {
      this.setStatus(422);
      return { message: 'priority deve essere un intero tra 1 (alta) e 10 (bassa)' };
    }
    if (body.status !== undefined && !isValidTaskStatus(body.status)) {
      this.setStatus(422);
      return { message: 'status non valido' };
    }
    if (body.dueDate !== undefined && body.dueDate !== null && !isValidDueDate(body.dueDate)) {
      this.setStatus(422);
      return { message: 'dueDate deve essere una data valida in formato YYYY-MM-DD, oppure null' };
    }

    const user = getAuthenticatedUser(request);
    try {
      await assertProjectAccessible(projectId, user);
      const task = await createTask(
        projectId,
        {
          title: body.title,
          description: body.description,
          status: body.status,
          priority: body.priority,
          dueDate: body.dueDate,
          assigneeIds: body.assigneeIds,
        },
        user.id,
        user.companyId,
      );
      this.setStatus(201);
      return task;
    } catch (err) {
      if (err instanceof ProjectNotFoundError || err instanceof UserNotFoundError) {
        this.setStatus(404);
        return { message: err.message };
      }
      throw err;
    }
  }

  @Put('{projectId}/tasks/{taskId}')
  @Security('jwt')
  @Response<TaskErrorResponse>(404, 'Project o task non trovato')
  @Response<TaskErrorResponse>(409, 'Task già fatturato: lockato per sempre')
  @Response<TaskErrorResponse>(422, 'title presente ma vuoto, o dueDate non valida')
  public async updateTask(
    @Path() projectId: string,
    @Path() taskId: string,
    @Body() body: UpdateTaskRequest,
    @Request() request: ExRequest,
  ): Promise<Task | TaskErrorResponse> {
    // "title" vuoto (se fornito) è validato da taskService.updateTask, stesso
    // motivo del commento in createTask sopra.
    if (body.dueDate !== undefined && body.dueDate !== null && !isValidDueDate(body.dueDate)) {
      this.setStatus(422);
      return { message: 'dueDate deve essere una data valida in formato YYYY-MM-DD, oppure null' };
    }

    const user = getAuthenticatedUser(request);
    try {
      await assertProjectAccessible(projectId, user);
      return await updateTask(projectId, taskId, body, user.companyId);
    } catch (err) {
      if (err instanceof TaskNotFoundError || err instanceof ProjectNotFoundError) {
        this.setStatus(404);
        return { message: err.message };
      }
      const lockedResponse = this.mapTaskLockedError(err);
      if (lockedResponse) {
        return lockedResponse;
      }
      throw err;
    }
  }

  @Patch('{projectId}/tasks/{taskId}/status')
  @Security('jwt')
  @Response<TaskErrorResponse>(404, 'Project o task non trovato')
  @Response<TaskErrorResponse>(409, 'Task già fatturato: lockato per sempre')
  public async updateTaskStatus(
    @Path() projectId: string,
    @Path() taskId: string,
    @Body() body: UpdateTaskStatusRequest,
    @Request() request: ExRequest,
  ): Promise<Task | TaskErrorResponse> {
    const user = getAuthenticatedUser(request);
    try {
      await assertProjectAccessible(projectId, user);
      return await updateTaskStatus(projectId, taskId, body.status, user.companyId);
    } catch (err) {
      if (err instanceof TaskNotFoundError || err instanceof ProjectNotFoundError) {
        this.setStatus(404);
        return { message: err.message };
      }
      const lockedResponse = this.mapTaskLockedError(err);
      if (lockedResponse) {
        return lockedResponse;
      }
      throw err;
    }
  }

  @Patch('{projectId}/tasks/{taskId}/priority')
  @Security('jwt')
  @Response<TaskErrorResponse>(404, 'Project o task non trovato')
  @Response<TaskErrorResponse>(409, 'Task già fatturato: lockato per sempre')
  @Response<TaskErrorResponse>(422, 'priority non è un intero tra 1 e 10')
  public async updateTaskPriority(
    @Path() projectId: string,
    @Path() taskId: string,
    @Body() body: UpdateTaskPriorityRequest,
    @Request() request: ExRequest,
  ): Promise<Task | TaskErrorResponse> {
    if (!isValidPriority(body.priority)) {
      this.setStatus(422);
      return { message: 'priority deve essere un intero tra 1 (alta) e 10 (bassa)' };
    }

    const user = getAuthenticatedUser(request);
    try {
      await assertProjectAccessible(projectId, user);
      return await updateTaskPriority(projectId, taskId, body.priority, user.companyId);
    } catch (err) {
      if (err instanceof TaskNotFoundError || err instanceof ProjectNotFoundError) {
        this.setStatus(404);
        return { message: err.message };
      }
      const lockedResponse = this.mapTaskLockedError(err);
      if (lockedResponse) {
        return lockedResponse;
      }
      throw err;
    }
  }

  @Patch('{projectId}/tasks/{taskId}/work-timer')
  @Security('jwt')
  @Response<TaskErrorResponse>(404, 'Project o task non trovato')
  @Response<TaskErrorResponse>(409, 'Task già fatturato: lockato per sempre')
  @Response<TaskErrorResponse>(422, 'action non valida')
  public async updateTaskWorkTimer(
    @Path() projectId: string,
    @Path() taskId: string,
    @Body() body: UpdateTaskWorkTimerRequest,
    @Request() request: ExRequest,
  ): Promise<Task | TaskErrorResponse> {
    if (!isValidWorkTimerAction(body.action)) {
      this.setStatus(422);
      return { message: "action deve essere 'start', 'pause', 'stop' o 'reset'" };
    }

    const user = getAuthenticatedUser(request);
    try {
      await assertProjectAccessible(projectId, user);
      return await updateTaskWorkTimer(projectId, taskId, body.action, user.companyId);
    } catch (err) {
      if (err instanceof TaskNotFoundError || err instanceof ProjectNotFoundError) {
        this.setStatus(404);
        return { message: err.message };
      }
      const lockedResponse = this.mapTaskLockedError(err);
      if (lockedResponse) {
        return lockedResponse;
      }
      throw err;
    }
  }

  // Correzione manuale del tempo accumulato, distinta da work-timer sopra:
  // quest'ultimo applica un comando relativo (start/pause/stop/reset), qui il
  // client impone direttamente il valore finale (per rimediare a un timer
  // dimenticato). Vedi commento su taskService.updateTaskElapsedTime per il
  // comportamento quando il timer è in esecuzione.
  @Patch('{projectId}/tasks/{taskId}/work-timer/elapsed-seconds')
  @Security('jwt')
  @Response<TaskErrorResponse>(404, 'Project o task non trovato')
  @Response<TaskErrorResponse>(409, 'Task già fatturato: lockato per sempre')
  @Response<TaskErrorResponse>(422, 'workAccumulatedSeconds non valido')
  public async updateTaskElapsedTime(
    @Path() projectId: string,
    @Path() taskId: string,
    @Body() body: UpdateTaskElapsedTimeRequest,
    @Request() request: ExRequest,
  ): Promise<Task | TaskErrorResponse> {
    if (!isValidAccumulatedSeconds(body.workAccumulatedSeconds)) {
      this.setStatus(422);
      return { message: 'workAccumulatedSeconds deve essere un intero tra 0 e 8639999 (99 giorni 23:59:59)' };
    }

    const user = getAuthenticatedUser(request);
    try {
      await assertProjectAccessible(projectId, user);
      return await updateTaskElapsedTime(projectId, taskId, body.workAccumulatedSeconds, user.companyId);
    } catch (err) {
      if (err instanceof TaskNotFoundError || err instanceof ProjectNotFoundError) {
        this.setStatus(404);
        return { message: err.message };
      }
      const lockedResponse = this.mapTaskLockedError(err);
      if (lockedResponse) {
        return lockedResponse;
      }
      throw err;
    }
  }

  @Delete('{projectId}/tasks/{taskId}')
  @Security('jwt')
  @SuccessResponse(204, 'Task eliminato')
  @Response<TaskErrorResponse>(404, 'Project o task non trovato')
  @Response<TaskErrorResponse>(409, 'Task già fatturato: lockato per sempre')
  public async deleteTask(
    @Path() projectId: string,
    @Path() taskId: string,
    @Request() request: ExRequest,
  ): Promise<void | TaskErrorResponse> {
    const user = getAuthenticatedUser(request);
    try {
      await assertProjectAccessible(projectId, user);
      await deleteTask(projectId, taskId, user.companyId);
      this.setStatus(204);
    } catch (err) {
      if (err instanceof TaskNotFoundError || err instanceof ProjectNotFoundError) {
        this.setStatus(404);
        return;
      }
      const lockedResponse = this.mapTaskLockedError(err);
      if (lockedResponse) {
        return lockedResponse;
      }
      throw err;
    }
  }

  @Put('{projectId}/tasks/{taskId}/assignees')
  @Security('jwt')
  @Response<TaskErrorResponse>(404, 'Project, task o utente non trovato')
  @Response<TaskErrorResponse>(409, 'Task già fatturato: lockato per sempre')
  public async updateTaskAssignees(
    @Path() projectId: string,
    @Path() taskId: string,
    @Body() body: UpdateTaskAssigneesRequest,
    @Request() request: ExRequest,
  ): Promise<Task | TaskErrorResponse> {
    const user = getAuthenticatedUser(request);
    try {
      await assertProjectAccessible(projectId, user);
      return await setTaskAssignees(projectId, taskId, body.userIds, user.companyId, user.id);
    } catch (err) {
      if (err instanceof TaskNotFoundError || err instanceof ProjectNotFoundError || err instanceof UserNotFoundError) {
        this.setStatus(404);
        return { message: err.message };
      }
      const lockedResponse = this.mapTaskLockedError(err);
      if (lockedResponse) {
        return lockedResponse;
      }
      throw err;
    }
  }
}
