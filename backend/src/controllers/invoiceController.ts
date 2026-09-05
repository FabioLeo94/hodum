import type { Request as ExRequest } from 'express';
import { Body, Controller, Get, Path, Post, Request, Response, Route, Security, SuccessResponse } from '@tsoa/runtime';
import { getAuthenticatedUser } from '../middleware/authentication';
import type { Invoice } from '../models/invoice';
import { CustomerNotFoundError } from '../services/customerService';
import {
  type BillableTask,
  generateInvoice,
  InvoiceGenerationInProgressError,
  InvoiceNotFoundError,
  type InvoiceWithItems,
  listBillableTasksForCustomer,
  listInvoicesByCompany,
  MissingRateError,
  NoTasksSelectedError,
  getInvoiceWithItems as getInvoiceWithItemsService,
  TaskNotBillableError,
  type TaskSelectionInput,
} from '../services/invoiceService';

// Nome distinto dagli omonimi "ErrorResponse" degli altri controller: tsoa
// risolve i modelli per nome dell'interfaccia a livello globale (non per
// file), stesso motivo di CustomerErrorResponse in customerController.ts.
interface InvoiceErrorResponse {
  message: string;
}

// Stesso principio di customerNotFoundResponse in customerController.ts: un
// id fuori dal proprio scope risponde 404, mai un 403 che confermerebbe
// l'esistenza di una risorsa altrui.
function customerNotFoundResponse(id: string): InvoiceErrorResponse {
  return { message: `Customer con id ${id} non trovato` };
}

function companyNotFoundResponse(id: string): InvoiceErrorResponse {
  return { message: `Company non trovata: ${id}` };
}

function invoiceNotFoundResponse(id: string): InvoiceErrorResponse {
  return { message: `Invoice con id ${id} non trovata` };
}

export interface GenerateInvoiceTaskSelection {
  taskId: string;
  // true = la riga resta nel documento con le sue ore ma con importo a zero
  // nel totale economico (la tariffa_oraria_snapshot salvata resta comunque
  // quella vera, vedi commento in models/invoiceItem.ts).
  nonFatturabile: boolean;
}

export interface GenerateInvoiceRequest {
  taskSelections: GenerateInvoiceTaskSelection[];
}

// Route annidata sotto 'customers/{customerId}', stesso pattern di
// 'companies/{id}/backups' in backupController.ts: la pre-fattura è sempre
// generata PER un cliente specifico, non una risorsa di primo livello.
// Riservato all'owner, come le altre voci di "Gestione aziendale" (vedi
// CustomerController, stesso principio).
@Route('customers')
export class CustomerInvoiceController extends Controller {
  @Post('{customerId}/invoices')
  @Security('owner')
  @SuccessResponse(201, 'Pre-fattura generata')
  @Response<InvoiceErrorResponse>(404, 'Cliente non trovato')
  @Response<InvoiceErrorResponse>(409, 'Task non più fatturabile, o generazione già in corso per questa azienda')
  @Response<InvoiceErrorResponse>(422, 'Nessun task selezionato, o nessuna tariffa oraria impostata')
  public async generateInvoice(
    @Path() customerId: string,
    @Body() body: GenerateInvoiceRequest,
    @Request() request: ExRequest,
  ): Promise<Invoice | InvoiceErrorResponse> {
    const requester = getAuthenticatedUser(request);
    if (requester.companyId === null) {
      this.setStatus(404);
      return customerNotFoundResponse(customerId);
    }
    // Stesso principio di createTask in taskController.ts: tsoa valida che
    // taskSelections sia un array (campo non opzionale), ma non che non sia
    // vuoto, è una regola di dominio e resta responsabilità del controller.
    // NoTasksSelectedError nel service resta comunque una difesa in
    // profondità per chi chiamasse generateInvoice direttamente.
    if (!Array.isArray(body.taskSelections) || body.taskSelections.length === 0) {
      this.setStatus(422);
      return { message: 'Seleziona almeno un task da fatturare' };
    }

    const selections: TaskSelectionInput[] = body.taskSelections.map((s) => ({
      taskId: s.taskId,
      nonFatturabile: s.nonFatturabile === true,
    }));

    try {
      const invoice = await generateInvoice(requester.companyId, customerId, selections);
      this.setStatus(201);
      return invoice;
    } catch (err) {
      if (err instanceof CustomerNotFoundError) {
        this.setStatus(404);
        return customerNotFoundResponse(customerId);
      }
      if (err instanceof MissingRateError || err instanceof NoTasksSelectedError) {
        this.setStatus(422);
        return { message: err.message };
      }
      if (err instanceof TaskNotBillableError || err instanceof InvoiceGenerationInProgressError) {
        this.setStatus(409);
        return { message: err.message };
      }
      throw err;
    }
  }

  // Alimenta la UI di selezione task lato frontend prima di POST 'invoices':
  // stessa regola di fatturabilità applicata dentro generateInvoice per la
  // rivalidazione, qui solo in lettura. Dichiarata come sotto-percorso
  // letterale ('invoices/billable-tasks', non un path param) sotto lo stesso
  // '{customerId}/invoices' del POST sopra: nessuna ambiguità di
  // registrazione tsoa perché il segmento finale è letterale, non un secondo
  // parametro candidato (a differenza del caso 'summary' vs '{id}' in
  // CustomerController, qui non serve un ordine di dichiarazione particolare).
  @Get('{customerId}/invoices/billable-tasks')
  @Security('owner')
  @Response<InvoiceErrorResponse>(404, 'Cliente non trovato')
  public async listBillableTasks(
    @Path() customerId: string,
    @Request() request: ExRequest,
  ): Promise<BillableTask[] | InvoiceErrorResponse> {
    const requester = getAuthenticatedUser(request);
    if (requester.companyId === null) {
      this.setStatus(404);
      return customerNotFoundResponse(customerId);
    }
    try {
      return await listBillableTasksForCustomer(customerId, requester.companyId);
    } catch (err) {
      if (err instanceof CustomerNotFoundError) {
        this.setStatus(404);
        return customerNotFoundResponse(customerId);
      }
      throw err;
    }
  }
}

// Route annidata sotto 'companies/{id}', stesso pattern di 'companies/{id}/backups'
// in backupController.ts: ogni endpoint verifica che {id} combaci con la
// company del richiedente prima di agire.
@Route('companies')
export class CompanyInvoiceController extends Controller {
  @Get('{id}/invoices')
  @Security('owner')
  @Response<InvoiceErrorResponse>(404, 'Company non trovata')
  public async listCompanyInvoices(
    @Path() id: string,
    @Request() request: ExRequest,
  ): Promise<Invoice[] | InvoiceErrorResponse> {
    const requester = getAuthenticatedUser(request);
    if (requester.companyId === null || id !== requester.companyId) {
      this.setStatus(404);
      return companyNotFoundResponse(id);
    }
    return listInvoicesByCompany(id);
  }
}

// Risorsa di primo livello (a differenza delle due sopra, annidate): una
// singola pre-fattura si identifica per il proprio id, non serve passare
// anche customerId/companyId nel path (verificati comunque contro la company
// del richiedente dentro getInvoiceWithItems). Il PDF NON è servito da questo
// controller: GET /invoices/{invoiceId}/pdf è una rotta Express raw montata
// in app.ts (streaming binario, non un JSON), vedi commento lì per il motivo.
@Route('invoices')
export class InvoiceController extends Controller {
  @Get('{invoiceId}')
  @Security('owner')
  @Response<InvoiceErrorResponse>(404, 'Pre-fattura non trovata')
  public async getInvoice(
    @Path() invoiceId: string,
    @Request() request: ExRequest,
  ): Promise<InvoiceWithItems | InvoiceErrorResponse> {
    const requester = getAuthenticatedUser(request);
    if (requester.companyId === null) {
      this.setStatus(404);
      return invoiceNotFoundResponse(invoiceId);
    }
    try {
      return await getInvoiceWithItemsService(invoiceId, requester.companyId);
    } catch (err) {
      if (err instanceof InvoiceNotFoundError) {
        this.setStatus(404);
        return invoiceNotFoundResponse(invoiceId);
      }
      throw err;
    }
  }
}
