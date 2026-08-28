import { Body, Controller, Get, Patch, Path, Post, Put, Response, Route, SuccessResponse } from 'tsoa';
import type { Task, TaskStatus } from '../models/task';
import {
  createTask,
  listTasksByProject,
  ProjectNotFoundError,
  TaskNotFoundError,
  updateTask,
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
  @Response<TaskErrorResponse>(404, 'Project non trovato')
  public async listProjectTasks(@Path() projectId: string): Promise<Task[] | TaskErrorResponse> {
    try {
      return await listTasksByProject(projectId);
    } catch (err) {
      if (err instanceof ProjectNotFoundError) {
        this.setStatus(404);
        return { message: err.message };
      }
      throw err;
    }
  }

  @Post('{projectId}/tasks')
  @SuccessResponse(201, 'Task creato')
  @Response<TaskErrorResponse>(404, 'Project non trovato')
  @Response<TaskErrorResponse>(422, 'title mancante o vuoto')
  public async createTask(
    @Path() projectId: string,
    @Body() body: CreateTaskRequest,
  ): Promise<Task | TaskErrorResponse> {
    // Stesso pattern di createProject in projectController.ts: tsoa valida
    // che "title" sia una stringa (campo non opzionale), ma non che non sia
    // vuota, è una regola di dominio e resta responsabilità del controller.
    if (body.title.trim().length === 0) {
      this.setStatus(422);
      return { message: 'title non può essere vuoto' };
    }

    try {
      const task = await createTask(projectId, { title: body.title, description: body.description });
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
  @Response<TaskErrorResponse>(404, 'Task non trovato')
  @Response<TaskErrorResponse>(422, 'title presente ma vuoto')
  public async updateTask(
    @Path() projectId: string,
    @Path() taskId: string,
    @Body() body: UpdateTaskRequest,
  ): Promise<Task | TaskErrorResponse> {
    if (body.title !== undefined && body.title.trim().length === 0) {
      this.setStatus(422);
      return { message: 'title non può essere vuoto' };
    }

    try {
      return await updateTask(projectId, taskId, body);
    } catch (err) {
      if (err instanceof TaskNotFoundError) {
        this.setStatus(404);
        return { message: err.message };
      }
      throw err;
    }
  }

  @Patch('{projectId}/tasks/{taskId}/status')
  @Response<TaskErrorResponse>(404, 'Task non trovato')
  public async updateTaskStatus(
    @Path() projectId: string,
    @Path() taskId: string,
    @Body() body: UpdateTaskStatusRequest,
  ): Promise<Task | TaskErrorResponse> {
    try {
      return await updateTaskStatus(projectId, taskId, body.status);
    } catch (err) {
      if (err instanceof TaskNotFoundError) {
        this.setStatus(404);
        return { message: err.message };
      }
      throw err;
    }
  }
}
