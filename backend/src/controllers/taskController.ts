import type { Request as ExRequest } from 'express';
import { Body, Controller, Delete, Get, Patch, Path, Post, Put, Request, Response, Route, Security, SuccessResponse } from 'tsoa';
import { getAuthenticatedUser } from '../middleware/authentication';
import type { Task, TaskStatus } from '../models/task';
import {
  createTask,
  deleteTask,
  isValidPriority,
  listTasksByProject,
  ProjectNotFoundError,
  TaskNotFoundError,
  updateTask,
  updateTaskPriority,
  updateTaskStatus,
} from '../services/taskService';

// Nome distinto da "ErrorResponse" di projectController.ts: tsoa risolve i
// modelli per nome dell'interfaccia a livello globale (non per file), quindi
// due interfacce omonime in controller diversi collidono in generazione.
interface TaskErrorResponse {
  message: string;
}

export interface CreateTaskRequest {
  title: string;
  description?: string;
}

export interface UpdateTaskStatusRequest {
  status: TaskStatus;
}

export interface UpdateTaskPriorityRequest {
  priority: number;
}

export interface UpdateTaskRequest {
  title?: string;
  description?: string;
}

// Stesso prefisso 'projects' di ProjectController: la risorsa task è
// annidata sotto un progetto (/projects/{projectId}/tasks), non una risorsa
// di primo livello.
@Route('projects')
export class TaskController extends Controller {
  @Get('{projectId}/tasks')
  @Security('jwt')
  @Response<TaskErrorResponse>(404, 'Project non trovato')
  public async listProjectTasks(
    @Path() projectId: string,
    @Request() request: ExRequest,
  ): Promise<Task[] | TaskErrorResponse> {
    const user = getAuthenticatedUser(request);
    try {
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
  @Response<TaskErrorResponse>(422, 'title mancante o vuoto')
  public async createTask(
    @Path() projectId: string,
    @Body() body: CreateTaskRequest,
    @Request() request: ExRequest,
  ): Promise<Task | TaskErrorResponse> {
    // Stesso pattern di createProject in projectController.ts: tsoa valida
    // che "title" sia una stringa (campo non opzionale), ma non che non sia
    // vuota, è una regola di dominio e resta responsabilità del controller.
    if (body.title.trim().length === 0) {
      this.setStatus(422);
      return { message: 'title non può essere vuoto' };
    }

    const user = getAuthenticatedUser(request);
    try {
      const task = await createTask(projectId, { title: body.title, description: body.description }, user.companyId);
      this.setStatus(201);
      return task;
    } catch (err) {
      if (err instanceof ProjectNotFoundError) {
        this.setStatus(404);
        return { message: err.message };
      }
      throw err;
    }
  }

  @Put('{projectId}/tasks/{taskId}')
  @Security('jwt')
  @Response<TaskErrorResponse>(404, 'Project o task non trovato')
  @Response<TaskErrorResponse>(422, 'title presente ma vuoto')
  public async updateTask(
    @Path() projectId: string,
    @Path() taskId: string,
    @Body() body: UpdateTaskRequest,
    @Request() request: ExRequest,
  ): Promise<Task | TaskErrorResponse> {
    if (body.title !== undefined && body.title.trim().length === 0) {
      this.setStatus(422);
      return { message: 'title non può essere vuoto' };
    }

    const user = getAuthenticatedUser(request);
    try {
      return await updateTask(projectId, taskId, body, user.companyId);
    } catch (err) {
      if (err instanceof TaskNotFoundError || err instanceof ProjectNotFoundError) {
        this.setStatus(404);
        return { message: err.message };
      }
      throw err;
    }
  }

  @Patch('{projectId}/tasks/{taskId}/status')
  @Security('jwt')
  @Response<TaskErrorResponse>(404, 'Project o task non trovato')
  public async updateTaskStatus(
    @Path() projectId: string,
    @Path() taskId: string,
    @Body() body: UpdateTaskStatusRequest,
    @Request() request: ExRequest,
  ): Promise<Task | TaskErrorResponse> {
    const user = getAuthenticatedUser(request);
    try {
      return await updateTaskStatus(projectId, taskId, body.status, user.companyId);
    } catch (err) {
      if (err instanceof TaskNotFoundError || err instanceof ProjectNotFoundError) {
        this.setStatus(404);
        return { message: err.message };
      }
      throw err;
    }
  }

  @Patch('{projectId}/tasks/{taskId}/priority')
  @Security('jwt')
  @Response<TaskErrorResponse>(404, 'Project o task non trovato')
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
      return await updateTaskPriority(projectId, taskId, body.priority, user.companyId);
    } catch (err) {
      if (err instanceof TaskNotFoundError || err instanceof ProjectNotFoundError) {
        this.setStatus(404);
        return { message: err.message };
      }
      throw err;
    }
  }

  @Delete('{projectId}/tasks/{taskId}')
  @Security('jwt')
  @SuccessResponse(204, 'Task eliminato')
  @Response<TaskErrorResponse>(404, 'Project o task non trovato')
  public async deleteTask(
    @Path() projectId: string,
    @Path() taskId: string,
    @Request() request: ExRequest,
  ): Promise<void> {
    const user = getAuthenticatedUser(request);
    try {
      await deleteTask(projectId, taskId, user.companyId);
      this.setStatus(204);
    } catch (err) {
      if (err instanceof TaskNotFoundError || err instanceof ProjectNotFoundError) {
        this.setStatus(404);
        return;
      }
      throw err;
    }
  }
}
