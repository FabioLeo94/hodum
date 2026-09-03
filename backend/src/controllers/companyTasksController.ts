import type { Request as ExRequest } from 'express';
import { Controller, Get, Request, Route, Security } from 'tsoa';
import { getAuthenticatedUser } from '../middleware/authentication';
import type { TaskWithProject } from '../models/task';
import { listTasksByCompany } from '../services/taskService';

// Risorsa di primo livello (non annidata sotto 'projects' come TaskController):
// la vista calendario aggregata della dashboard mostra i task di più progetti
// insieme, quindi non ha senso appenderla sotto un singolo {projectId}.
@Route('tasks')
export class CompanyTasksController extends Controller {
  @Get()
  @Security('jwt')
  public async listCompanyTasks(@Request() request: ExRequest): Promise<TaskWithProject[]> {
    const user = getAuthenticatedUser(request);
    // Stesso criterio di ProjectController.listProjects: un dipendente vede
    // solo i task dei progetti a cui è assegnato, owner/manager vedono tutta
    // la company.
    if (user.role === 'employee') {
      return listTasksByCompany(user.companyId, user.id);
    }
    return listTasksByCompany(user.companyId);
  }
}
