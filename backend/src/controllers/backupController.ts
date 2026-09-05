import type { Request as ExRequest } from 'express';
import { Body, Controller, Delete, Get, Path, Post, Put, Request, Response, Route, Security, SuccessResponse } from '@tsoa/runtime';
import { getAuthenticatedUser } from '../middleware/authentication';
import type { BackupRecord, BackupSettings } from '../models/backup';
import {
  BackupInProgressError,
  BackupNotFoundError,
  CompanyNotFoundForBackupError,
  deleteBackup,
  getBackupSettings,
  listBackups,
  restoreBackup,
  runBackup,
  updateBackupSettings,
} from '../services/backupService';

// Nome distinto dall'omonimo "ErrorResponse" degli altri controller: tsoa
// risolve i modelli per nome dell'interfaccia a livello globale, non per
// file (stesso motivo di CompanyErrorResponse in companyController.ts).
interface BackupErrorResponse {
  message: string;
}

// Stesso principio di companyNotFoundResponse in companyController.ts: un id
// fuori dalla propria company resta un 404, mai un 403 che confermerebbe
// l'esistenza di un'azienda altrui.
function companyNotFoundResponse(id: string): BackupErrorResponse {
  return { message: `Company non trovata: ${id}` };
}

const backupNotFoundResponse: BackupErrorResponse = { message: 'Backup non trovato' };

export interface UpdateBackupSettingsRequest {
  intervalMinutes: number;
  maxBackups: number;
  filenameFormat: string;
}

// Route annidata sotto 'companies/{id}', stesso pattern di 'companies/{id}/employees'
// in companyController.ts: ogni endpoint verifica che {id} combaci con la
// company del richiedente prima di agire, invece di dedurla implicitamente
// dal token (coerenza con il resto del controller aziendale).
@Route('companies')
export class BackupController extends Controller {
  @Get('{id}/backups/settings')
  @Security('owner')
  @Response<BackupErrorResponse>(404, 'Company non trovata')
  public async getSettings(
    @Path() id: string,
    @Request() request: ExRequest,
  ): Promise<BackupSettings | BackupErrorResponse> {
    const requester = getAuthenticatedUser(request);
    if (requester.companyId === null || id !== requester.companyId) {
      this.setStatus(404);
      return companyNotFoundResponse(id);
    }
    return getBackupSettings(id);
  }

  @Put('{id}/backups/settings')
  @Security('owner')
  @Response<BackupErrorResponse>(404, 'Company non trovata')
  @Response<BackupErrorResponse>(422, 'intervalMinutes, maxBackups o filenameFormat non validi')
  public async putSettings(
    @Path() id: string,
    @Body() body: UpdateBackupSettingsRequest,
    @Request() request: ExRequest,
  ): Promise<BackupSettings | BackupErrorResponse> {
    const requester = getAuthenticatedUser(request);
    if (requester.companyId === null || id !== requester.companyId) {
      this.setStatus(404);
      return companyNotFoundResponse(id);
    }

    // intervalMinutes/maxBackups/filenameFormat validati in
    // backupService.updateBackupSettings (punto 2 della code review "niente
    // logica nei controller"): la ValidationError che lancia è mappata a 422
    // nell'error handler globale (app.ts), non qui.
    return updateBackupSettings(id, body);
  }

  // Sincrono (attende il pg_dump prima di rispondere) invece di 202 +
  // polling: per il volume di dati di una PMI/freelance un dump impiega
  // secondi, non minuti, e la UI (drawer) può mostrare uno stato di
  // caricamento sul bottone per quella durata senza bisogno di un
  // meccanismo di notifica separato.
  @Post('{id}/backups/run')
  @Security('owner')
  @SuccessResponse(201, 'Backup eseguito')
  @Response<BackupErrorResponse>(404, 'Company non trovata')
  @Response<BackupErrorResponse>(409, 'Un backup per questa azienda è già in corso')
  public async runManualBackup(
    @Path() id: string,
    @Request() request: ExRequest,
  ): Promise<BackupRecord | BackupErrorResponse> {
    const requester = getAuthenticatedUser(request);
    if (requester.companyId === null || id !== requester.companyId) {
      this.setStatus(404);
      return companyNotFoundResponse(id);
    }

    try {
      const record = await runBackup(id, 'manual');
      this.setStatus(201);
      return record;
    } catch (err) {
      if (err instanceof BackupInProgressError) {
        this.setStatus(409);
        return { message: err.message };
      }
      if (err instanceof CompanyNotFoundForBackupError) {
        this.setStatus(404);
        return companyNotFoundResponse(id);
      }
      throw err;
    }
  }

  @Get('{id}/backups')
  @Security('owner')
  @Response<BackupErrorResponse>(404, 'Company non trovata')
  public async listCompanyBackups(
    @Path() id: string,
    @Request() request: ExRequest,
  ): Promise<BackupRecord[] | BackupErrorResponse> {
    const requester = getAuthenticatedUser(request);
    if (requester.companyId === null || id !== requester.companyId) {
      this.setStatus(404);
      return companyNotFoundResponse(id);
    }
    return listBackups(id);
  }

  @Delete('{id}/backups/{backupId}')
  @Security('owner')
  @SuccessResponse(204, 'Backup eliminato')
  @Response<BackupErrorResponse>(404, 'Company o backup non trovato')
  public async deleteCompanyBackup(
    @Path() id: string,
    @Path() backupId: string,
    @Request() request: ExRequest,
  ): Promise<void | BackupErrorResponse> {
    const requester = getAuthenticatedUser(request);
    if (requester.companyId === null || id !== requester.companyId) {
      this.setStatus(404);
      return companyNotFoundResponse(id);
    }

    try {
      await deleteBackup(id, backupId);
      this.setStatus(204);
    } catch (err) {
      if (err instanceof BackupNotFoundError) {
        this.setStatus(404);
        return backupNotFoundResponse;
      }
      throw err;
    }
  }

  // Sincrono come '{id}/backups/run' (attende pg_dump + pg_restore prima di
  // rispondere): stessa scelta, stesso ordine di grandezza di dati per una
  // PMI/freelance.
  @Post('{id}/backups/{backupId}/restore')
  @Security('owner')
  @SuccessResponse(204, 'Backup ripristinato')
  @Response<BackupErrorResponse>(404, 'Company o backup non trovato')
  @Response<BackupErrorResponse>(409, 'Un backup o ripristino per questa azienda è già in corso')
  public async restoreCompanyBackup(
    @Path() id: string,
    @Path() backupId: string,
    @Request() request: ExRequest,
  ): Promise<void | BackupErrorResponse> {
    const requester = getAuthenticatedUser(request);
    if (requester.companyId === null || id !== requester.companyId) {
      this.setStatus(404);
      return companyNotFoundResponse(id);
    }

    try {
      await restoreBackup(id, backupId);
      this.setStatus(204);
    } catch (err) {
      if (err instanceof BackupNotFoundError) {
        this.setStatus(404);
        return backupNotFoundResponse;
      }
      if (err instanceof BackupInProgressError) {
        this.setStatus(409);
        return { message: err.message };
      }
      if (err instanceof CompanyNotFoundForBackupError) {
        this.setStatus(404);
        return companyNotFoundResponse(id);
      }
      throw err;
    }
  }
}
