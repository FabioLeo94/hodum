import { Controller, Get, Path, Response, Route } from 'tsoa';
import type { Task } from '../models/task';
import { listTasksByProject, ProjectNotFoundError } from '../services/taskService';

// Nome distinto da "ErrorResponse" di projectController.ts: tsoa risolve i
// modelli per nome dell'interfaccia a livello globale (non per file), quindi
// due interfacce omonime in controller diversi collidono in generazione.
interface TaskErrorResponse {
  message: string;
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
}
