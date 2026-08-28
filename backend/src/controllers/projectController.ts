import { Body, Controller, Delete, Get, Path, Post, Put, Response, Route, SuccessResponse } from 'tsoa';
import type { Project } from '../models/project';
import {
  createProject,
  deleteProject,
  getProjectById,
  listProjects,
  ProjectNotFoundError,
  updateProject,
} from '../services/projectService';

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
}

// Il path va scritto come stringa letterale: tsoa lo legge dall'AST prima
// dell'avvio, una costante importata non verrebbe risolta in generazione.
@Route('projects')
export class ProjectController extends Controller {
  @Get()
  public async listProjects(): Promise<Project[]> {
    return listProjects();
  }

  @Get('{id}')
  @Response<ErrorResponse>(404, 'Project non trovato')
  public async getProject(@Path() id: string): Promise<Project | ErrorResponse> {
    try {
      return await getProjectById(id);
    } catch (err) {
      if (err instanceof ProjectNotFoundError) {
        this.setStatus(404);
        return { message: err.message };
      }
      throw err;
    }
  }

  @Post()
  @SuccessResponse(201, 'Project creato')
  @Response<ErrorResponse>(422, 'name mancante o vuoto')
  public async createProject(@Body() body: CreateProjectRequest): Promise<Project | ErrorResponse> {
    // tsoa valida che "name" sia una stringa (campo non opzionale), ma non che
    // non sia vuota: è una regola di dominio, non di forma, quindi resta
    // responsabilità del controller e non del layer di validazione generato.
    if (body.name.trim().length === 0) {
      this.setStatus(422);
      return { message: 'name non può essere vuoto' };
    }

    this.setStatus(201);
    return createProject({ name: body.name, isActive: body.isActive });
  }

  @Put('{id}')
  @Response<ErrorResponse>(404, 'Project non trovato')
  @Response<ErrorResponse>(422, 'name presente ma vuoto')
  public async updateProject(
    @Path() id: string,
    @Body() body: UpdateProjectRequest,
  ): Promise<Project | ErrorResponse> {
    if (body.name !== undefined && body.name.trim().length === 0) {
      this.setStatus(422);
      return { message: 'name non può essere vuoto' };
    }

    try {
      return await updateProject(id, body);
    } catch (err) {
      if (err instanceof ProjectNotFoundError) {
        this.setStatus(404);
        return { message: err.message };
      }
      throw err;
    }
  }

  @Delete('{id}')
  @SuccessResponse(204, 'Project eliminato')
  @Response<ErrorResponse>(404, 'Project non trovato')
  public async deleteProject(@Path() id: string): Promise<void> {
    try {
      await deleteProject(id);
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
