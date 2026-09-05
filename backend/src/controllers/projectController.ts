import type { Request as ExRequest } from 'express';
import { Body, Controller, Delete, Get, Path, Post, Put, Request, Response, Route, Security, SuccessResponse } from '@tsoa/runtime';
import { getAuthenticatedUser } from '../middleware/authentication';
import type { Project } from '../models/project';
import {
  createProject,
  deleteProject,
  getProjectById,
  listProjects,
  MissingCompanyError,
  ProjectNotFoundError,
  updateProject,
} from '../services/projectService';
import { assertProjectAccessible } from '../services/projectAssignmentService';
import { CustomerNotFoundError } from '../services/customerService';

// Corpo di risposta per gli esiti di errore documentati via @Response: stessa
// forma { message } già usata dall'error handler globale in app.ts, per
// coerenza su tutta l'API.
interface ErrorResponse {
  message: string;
}

export interface CreateProjectRequest {
  name: string;
  isActive?: boolean;
}

export interface UpdateProjectRequest {
  name?: string;
  isActive?: boolean;
  // customerId passato così com'è al service (non `?? null`): tsoa distingue
  // il campo assente da null nel body JSON, e questa distinzione va preservata
  // fino a UpdateProjectInput.customerId (tri-stato, vedi projectService.ts),
  // stesso principio di dueDate in UpdateTaskRequest (taskController.ts).
  customerId?: string | null;
}

// Il path va scritto come stringa letterale: tsoa lo legge dall'AST prima
// dell'avvio, una costante importata non verrebbe risolta in generazione.
@Route('projects')
export class ProjectController extends Controller {
  @Get()
  @Security('jwt')
  public async listProjects(@Request() request: ExRequest): Promise<Project[]> {
    const user = getAuthenticatedUser(request);
    // Un dipendente vede solo i progetti a lui assegnati (task "Gestione del
    // dipendente"), l'owner vede tutti i progetti della company come prima.
    if (user.role === 'employee') {
      return listProjects(user.companyId, user.id);
    }
    return listProjects(user.companyId);
  }

  @Get('{id}')
  @Security('jwt')
  @Response<ErrorResponse>(404, 'Project non trovato')
  public async getProject(@Path() id: string, @Request() request: ExRequest): Promise<Project | ErrorResponse> {
    const user = getAuthenticatedUser(request);
    try {
      const project = await getProjectById(id, user.companyId);
      // Un dipendente non assegnato a questo progetto lo trova indistinguibile
      // da un progetto inesistente, stesso principio del cross-tenant sopra
      // (vedi assertProjectAccessible in projectAssignmentService.ts).
      await assertProjectAccessible(id, user);
      return project;
    } catch (err) {
      if (err instanceof ProjectNotFoundError) {
        this.setStatus(404);
        return { message: err.message };
      }
      throw err;
    }
  }

  @Post()
  @Security('manager')
  @SuccessResponse(201, 'Project creato')
  @Response<ErrorResponse>(422, 'name mancante o vuoto')
  @Response<ErrorResponse>(403, "L'utente non è associato a nessuna azienda")
  public async createProject(
    @Body() body: CreateProjectRequest,
    @Request() request: ExRequest,
  ): Promise<Project | ErrorResponse> {
    // "name non può essere vuoto" validato in projectService.createProject
    // (punto 2 della code review "niente logica nei controller"): la
    // ValidationError che lancia è mappata a 422 nell'error handler globale
    // (app.ts), non qui.
    const user = getAuthenticatedUser(request);
    try {
      const project = await createProject({ name: body.name, isActive: body.isActive }, user.companyId);
      this.setStatus(201);
      return project;
    } catch (err) {
      if (err instanceof MissingCompanyError) {
        this.setStatus(403);
        return { message: err.message };
      }
      throw err;
    }
  }

  @Put('{id}')
  @Security('manager')
  @Response<ErrorResponse>(404, 'Project o cliente non trovato')
  @Response<ErrorResponse>(422, 'name presente ma vuoto')
  public async updateProject(
    @Path() id: string,
    @Body() body: UpdateProjectRequest,
    @Request() request: ExRequest,
  ): Promise<Project | ErrorResponse> {
    // Stesso principio di createProject sopra: "name presente ma vuoto"
    // validato in projectService.updateProject.
    const user = getAuthenticatedUser(request);
    try {
      return await updateProject(id, body, user.companyId);
    } catch (err) {
      if (err instanceof ProjectNotFoundError || err instanceof CustomerNotFoundError) {
        this.setStatus(404);
        return { message: err.message };
      }
      throw err;
    }
  }

  @Delete('{id}')
  @Security('manager')
  @SuccessResponse(204, 'Project eliminato')
  @Response<ErrorResponse>(404, 'Project non trovato')
  public async deleteProject(@Path() id: string, @Request() request: ExRequest): Promise<void> {
    const user = getAuthenticatedUser(request);
    try {
      await deleteProject(id, user.companyId);
      this.setStatus(204);
    } catch (err) {
      if (err instanceof ProjectNotFoundError) {
        this.setStatus(404);
        return;
      }
      throw err;
    }
  }
}
