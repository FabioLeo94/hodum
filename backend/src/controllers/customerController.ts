import type { Request as ExRequest } from 'express';
import { Body, Controller, Delete, Get, Path, Post, Put, Request, Response, Route, Security, SuccessResponse } from '@tsoa/runtime';
import { getAuthenticatedUser } from '../middleware/authentication';
import type { RateUnit } from '../models/company';
import type { Customer } from '../models/customer';
import {
  createCustomer,
  CustomerNotFoundError,
  type CustomerSummary,
  deleteCustomer,
  getCustomerById,
  InvalidTariffaError,
  listCustomerSummariesByCompany,
  listCustomersByCompany,
  updateCustomer,
} from '../services/customerService';

// Nome distinto dagli omonimi "ErrorResponse" degli altri controller: tsoa
// risolve i modelli per nome dell'interfaccia a livello globale (non per
// file), quindi collidono in generazione se condivisi.
interface CustomerErrorResponse {
  message: string;
}

export interface CreateCustomerRequest {
  name: string;
  description?: string | null;
  // Opzionale per sempre (0034): se tariffaOraria è assente/null, tariffaUnita
  // viene forzato a null; se tariffaOraria è presente e tariffaUnita è
  // assente/null, si applica il default 'oraria' (stesso accoppiamento di
  // Company, vedi companyController.updateCompany).
  tariffaOraria?: number | null;
  tariffaUnita?: RateUnit | null;
}

export interface UpdateCustomerRequest {
  name: string;
  description?: string | null;
  tariffaOraria?: number | null;
  tariffaUnita?: RateUnit | null;
}

// Un id nel path che non combacia con la company del richiedente (o un
// richiedente senza company) risponde 404, non 403: stesso principio di
// companyNotFoundResponse in companyController.ts, non conferma con un 403
// l'esistenza di un cliente fuori dal proprio ambito.
function customerNotFoundResponse(id: string): CustomerErrorResponse {
  return { message: `Customer con id ${id} non trovato` };
}

// Riservato all'owner, come le altre voci di "Gestione aziendale"
// (updateCompany/createEmployee in companyController.ts): la pagina che apre
// questo drawer è owner-only (companyManagement.tsx), quindi lo è anche
// l'API che la alimenta.
@Route('customers')
export class CustomerController extends Controller {
  @Get()
  @Security('owner')
  public async listCustomers(@Request() request: ExRequest): Promise<Customer[]> {
    const requester = getAuthenticatedUser(request);
    if (requester.companyId === null) {
      return [];
    }
    return listCustomersByCompany(requester.companyId);
  }

  // Dichiarata prima di @Get('{id}') sotto: tsoa registra le rotte Express
  // nell'ordine di dichiarazione dei metodi, quindi 'summary' deve precedere
  // '{id}' per non essere interpretato come un valore di quel path param.
  // @Security('manager') (non 'owner' come le altre rotte di questo
  // controller): la dropdown di assegnazione cliente in
  // RenameProjectModalComponent la usa anche il project manager, che non
  // ha accesso alle altre rotte /customers (gestione clienti owner-only).
  @Get('summary')
  @Security('manager')
  public async listCustomerSummaries(@Request() request: ExRequest): Promise<CustomerSummary[]> {
    const requester = getAuthenticatedUser(request);
    if (requester.companyId === null) {
      return [];
    }
    return listCustomerSummariesByCompany(requester.companyId);
  }

  @Post()
  @Security('owner')
  @SuccessResponse(201, 'Cliente creato')
  @Response<CustomerErrorResponse>(404, 'Azienda non trovata')
  @Response<CustomerErrorResponse>(422, 'name, tariffaOraria o tariffaUnita non validi')
  public async createCustomer(
    @Body() body: CreateCustomerRequest,
    @Request() request: ExRequest,
  ): Promise<Customer | CustomerErrorResponse> {
    const requester = getAuthenticatedUser(request);
    if (requester.companyId === null) {
      this.setStatus(404);
      return { message: "L'utente non è associato a nessuna azienda" };
    }
    if (body.name.trim().length === 0) {
      this.setStatus(422);
      return { message: 'name non può essere vuoto' };
    }

    try {
      // L'accoppiamento tariffaOraria/tariffaUnita è validato e normalizzato
      // dentro createCustomer (customerService.ts): il controller inoltra i
      // valori grezzi e intercetta solo InvalidTariffaError per il 422.
      const customer = await createCustomer(requester.companyId, {
        name: body.name.trim(),
        description: body.description?.trim() || null,
        tariffaOraria: body.tariffaOraria,
        tariffaUnita: body.tariffaUnita,
      });
      this.setStatus(201);
      return customer;
    } catch (err) {
      if (err instanceof InvalidTariffaError) {
        this.setStatus(422);
        return { message: err.message };
      }
      throw err;
    }
  }

  @Get('{id}')
  @Security('owner')
  @Response<CustomerErrorResponse>(404, 'Cliente non trovato')
  public async getCustomer(
    @Path() id: string,
    @Request() request: ExRequest,
  ): Promise<Customer | CustomerErrorResponse> {
    const requester = getAuthenticatedUser(request);
    if (requester.companyId === null) {
      this.setStatus(404);
      return customerNotFoundResponse(id);
    }
    try {
      return await getCustomerById(id, requester.companyId);
    } catch (err) {
      if (err instanceof CustomerNotFoundError) {
        this.setStatus(404);
        return customerNotFoundResponse(id);
      }
      throw err;
    }
  }

  @Put('{id}')
  @Security('owner')
  @Response<CustomerErrorResponse>(404, 'Cliente non trovato')
  @Response<CustomerErrorResponse>(422, 'name, tariffaOraria o tariffaUnita non validi')
  public async updateCustomer(
    @Path() id: string,
    @Body() body: UpdateCustomerRequest,
    @Request() request: ExRequest,
  ): Promise<Customer | CustomerErrorResponse> {
    const requester = getAuthenticatedUser(request);
    if (requester.companyId === null) {
      this.setStatus(404);
      return customerNotFoundResponse(id);
    }
    if (body.name.trim().length === 0) {
      this.setStatus(422);
      return { message: 'name non può essere vuoto' };
    }

    try {
      // Stesso principio di createCustomer sopra: l'accoppiamento
      // tariffaOraria/tariffaUnita è validato dentro updateCustomer.
      return await updateCustomer(id, requester.companyId, {
        name: body.name.trim(),
        description: body.description?.trim() || null,
        tariffaOraria: body.tariffaOraria,
        tariffaUnita: body.tariffaUnita,
      });
    } catch (err) {
      if (err instanceof CustomerNotFoundError) {
        this.setStatus(404);
        return customerNotFoundResponse(id);
      }
      if (err instanceof InvalidTariffaError) {
        this.setStatus(422);
        return { message: err.message };
      }
      throw err;
    }
  }

  @Delete('{id}')
  @Security('owner')
  @SuccessResponse(204, 'Cliente eliminato')
  @Response<CustomerErrorResponse>(404, 'Cliente non trovato')
  public async deleteCustomer(@Path() id: string, @Request() request: ExRequest): Promise<void> {
    const requester = getAuthenticatedUser(request);
    if (requester.companyId === null) {
      this.setStatus(404);
      return;
    }
    try {
      await deleteCustomer(id, requester.companyId);
      this.setStatus(204);
    } catch (err) {
      if (err instanceof CustomerNotFoundError) {
        this.setStatus(404);
        return;
      }
      throw err;
    }
  }
}
