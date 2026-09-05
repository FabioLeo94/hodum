import { describe, it, expect, vi, beforeEach } from 'vitest';

// pool mockato: nessuna di queste query deve mai toccare un Postgres reale.
// Stesso pattern di companyService.test.ts/projectAssignmentService.test.ts.
vi.mock('../db/pool', () => ({
  pool: {
    query: vi.fn(),
    connect: vi.fn(),
  },
}));

// customerService/companyService/taskService/realtime/invoicePdfService
// mockati per intero (stesso stile "manual mock" di customerController.test.ts):
// invoiceService li usa come collaboratori, questi test verificano la LOGICA
// di invoiceService (numerazione, snapshot, transazione, lock), non il
// comportamento interno di quei moduli, già coperto dai rispettivi test.
// La classe va dichiarata DENTRO la factory: vi.mock è hoisted sopra ogni
// dichiarazione a livello di modulo, un riferimento a una classe esterna qui
// fallirebbe con un ReferenceError "before initialization".
vi.mock('./customerService', () => ({
  CustomerNotFoundError: class CustomerNotFoundError extends Error {
    constructor(public readonly id: string) {
      super(`Customer con id ${id} non trovato`);
      this.name = 'CustomerNotFoundError';
    }
  },
  getCustomerById: vi.fn(),
}));

vi.mock('./companyService', () => ({
  getCompanyById: vi.fn(),
}));

vi.mock('./taskService', () => ({
  getTasksByIds: vi.fn(),
}));

vi.mock('../realtime/io', () => ({
  emitTaskUpdated: vi.fn(),
}));

vi.mock('./invoicePdfService', () => ({
  renderInvoicePdf: vi.fn(),
  writeInvoicePdfToDisk: vi.fn(),
  resolveInvoicePdfPath: vi.fn((filename: string) => `/invoices/${filename}`),
}));

import { pool } from '../db/pool';
import { getCompanyById } from './companyService';
import { getCustomerById } from './customerService';
import { getTasksByIds } from './taskService';
import { emitTaskUpdated } from '../realtime/io';
import { renderInvoicePdf, writeInvoicePdfToDisk } from './invoicePdfService';
import type { Company } from '../models/company';
import type { Customer } from '../models/customer';
import {
  generateInvoice,
  getBillableTasksSummary,
  getInvoicesSummary,
  InvoiceGenerationInProgressError,
  NoTasksSelectedError,
  resolveRateForCustomer,
  TaskNotBillableError,
} from './invoiceService';

const poolQuery = vi.mocked(pool.query);
const poolConnect = vi.mocked(pool.connect);
const getCustomerByIdMock = vi.mocked(getCustomerById);
const getCompanyByIdMock = vi.mocked(getCompanyById);
const getTasksByIdsMock = vi.mocked(getTasksByIds);
const renderInvoicePdfMock = vi.mocked(renderInvoicePdf);
const writeInvoicePdfToDiskMock = vi.mocked(writeInvoicePdfToDisk);

const COMPANY_ID = 'company-1';
const CUSTOMER_ID = 'customer-1';
const TASK_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TASK_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: CUSTOMER_ID,
    companyId: COMPANY_ID,
    name: 'Cliente Uno',
    description: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastInvoicedAt: null,
    tariffaOraria: null,
    tariffaUnita: null,
    ...overrides,
  };
}

function makeCompany(overrides: Partial<Company> = {}): Company {
  return {
    id: COMPANY_ID,
    name: 'Acme',
    ownerId: 'owner-1',
    ragioneSociale: null,
    piva: null,
    codiceFiscale: null,
    indirizzo: null,
    pec: null,
    tariffaOraria: null,
    tariffaUnita: null,
    giorniLavorativi: {
      lunedi: true,
      martedi: true,
      mercoledi: true,
      giovedi: true,
      venerdi: true,
      sabato: false,
      domenica: false,
    },
    orarioLavoro: { continuativo: true, inizio1: '09:00', fine1: '18:00', inizio2: null, fine2: null },
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  poolQuery.mockReset();
  poolConnect.mockReset();
  getCustomerByIdMock.mockReset();
  getCompanyByIdMock.mockReset();
  getTasksByIdsMock.mockReset();
  renderInvoicePdfMock.mockReset().mockResolvedValue(Buffer.from('pdf'));
  writeInvoicePdfToDiskMock.mockReset().mockResolvedValue('invoice-1.pdf');
  vi.mocked(emitTaskUpdated).mockReset();
});

describe('resolveRateForCustomer: due soli livelli, cliente poi azienda', () => {
  it('usa la tariffa del cliente quando presente, senza nemmeno leggere la company', async () => {
    getCustomerByIdMock.mockResolvedValue(makeCustomer({ tariffaOraria: 50 }));

    await expect(resolveRateForCustomer(CUSTOMER_ID, COMPANY_ID)).resolves.toBe(50);
    expect(getCompanyByIdMock).not.toHaveBeenCalled();
  });

  it("ricade sulla tariffa della company quando quella del cliente è null", async () => {
    getCustomerByIdMock.mockResolvedValue(makeCustomer({ tariffaOraria: null }));
    getCompanyByIdMock.mockResolvedValue(makeCompany({ tariffaOraria: 30 }));

    await expect(resolveRateForCustomer(CUSTOMER_ID, COMPANY_ID)).resolves.toBe(30);
  });

  it('rifiuta con MissingRateError se sia cliente che company sono senza tariffa', async () => {
    getCustomerByIdMock.mockResolvedValue(makeCustomer({ tariffaOraria: null }));
    getCompanyByIdMock.mockResolvedValue(makeCompany({ tariffaOraria: null }));

    await expect(resolveRateForCustomer(CUSTOMER_ID, COMPANY_ID)).rejects.toThrow(
      /Nessuna tariffa oraria impostata/,
    );
  });
});

function makeLockClient() {
  return {
    query: vi.fn(),
    release: vi.fn(),
  };
}

describe('generateInvoice', () => {
  it('rifiuta con NoTasksSelectedError senza nemmeno aprire una connessione dedicata', async () => {
    getCustomerByIdMock.mockResolvedValue(makeCustomer());

    await expect(generateInvoice(COMPANY_ID, CUSTOMER_ID, [])).rejects.toBeInstanceOf(NoTasksSelectedError);
    expect(poolConnect).not.toHaveBeenCalled();
  });

  it('rifiuta con InvoiceGenerationInProgressError se il lock advisory è già di un\'altra generazione', async () => {
    getCustomerByIdMock.mockResolvedValue(makeCustomer());
    const client = makeLockClient();
    poolConnect.mockResolvedValue(client as never);
    client.query
      .mockResolvedValueOnce({ rows: [{ acquired: false }] }) // pg_try_advisory_lock fallito
      .mockResolvedValueOnce({}); // ROLLBACK difensivo nel catch

    await expect(
      generateInvoice(COMPANY_ID, CUSTOMER_ID, [{ taskId: TASK_A, nonFatturabile: false }]),
    ).rejects.toBeInstanceOf(InvoiceGenerationInProgressError);
    // Lock mai acquisito: pg_advisory_unlock non va chiamato, solo release() del client.
    expect(client.query).toHaveBeenCalledTimes(2);
    expect(client.release).toHaveBeenCalled();
  });

  it('rifiuta con TaskNotBillableError se un task selezionato non supera la rivalidazione dentro la transazione', async () => {
    getCustomerByIdMock.mockResolvedValue(makeCustomer({ tariffaOraria: 40 }));
    const client = makeLockClient();
    poolConnect.mockResolvedValue(client as never);
    client.query
      .mockResolvedValueOnce({ rows: [{ acquired: true }] }) // lock
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: TASK_A, title: 'Task A', project_id: 'proj-1', work_accumulated_seconds: 3600 }] }) // FOR UPDATE: manca TASK_B
      .mockResolvedValueOnce({}) // ROLLBACK
      .mockResolvedValueOnce({ rows: [{}] }); // unlock

    await expect(
      generateInvoice(COMPANY_ID, CUSTOMER_ID, [
        { taskId: TASK_A, nonFatturabile: false },
        { taskId: TASK_B, nonFatturabile: false },
      ]),
    ).rejects.toBeInstanceOf(TaskNotBillableError);
    expect(client.query).toHaveBeenNthCalledWith(4, 'ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });

  it('genera la pre-fattura: numero progressivo, snapshot tariffa e totali corretti (una riga non fatturabile azzera solo l\'importo)', async () => {
    getCustomerByIdMock.mockResolvedValue(makeCustomer({ tariffaOraria: null }));
    getCompanyByIdMock.mockResolvedValue(makeCompany({ tariffaOraria: 40 }));
    getTasksByIdsMock.mockResolvedValue([
      {
        id: TASK_A,
        projectId: 'proj-1',
        title: 'Task A',
        description: null,
        status: 'completed',
        priority: 5,
        dueDate: null,
        assignees: [],
        workStartedAt: null,
        workAccumulatedSeconds: 3600,
        workEndedAt: null,
        invoiceId: 'invoice-1',
      },
      {
        id: TASK_B,
        projectId: 'proj-1',
        title: 'Task B',
        description: null,
        status: 'completed',
        priority: 5,
        dueDate: null,
        assignees: [],
        workStartedAt: null,
        workAccumulatedSeconds: 1800,
        workEndedAt: null,
        invoiceId: 'invoice-1',
      },
    ] as never);

    const client = makeLockClient();
    poolConnect.mockResolvedValue(client as never);

    const invoiceRow = {
      id: 'invoice-1',
      company_id: COMPANY_ID,
      customer_id: CUSTOMER_ID,
      numero: 5,
      data_generazione: new Date('2026-02-01T10:00:00.000Z'),
      totale_secondi: 5400,
      totale_importo: '40.00',
      pdf_path: 'pending',
    };

    // Tutte le query DENTRO la transazione passano da client.query (il
    // lockClient dedicato): lock, BEGIN, rivalidazione, numerazione, insert
    // fattura/righe, lock dei task, last_invoiced_at, COMMIT, unlock. Il PDF
    // (loadInvoiceItems + UPDATE pdf_path) avviene DOPO, fuori dalla
    // transazione, quindi su poolQuery — un mock separato, vedi sotto.
    client.query
      .mockResolvedValueOnce({ rows: [{ acquired: true }] }) // 1: lock
      .mockResolvedValueOnce({}) // 2: BEGIN
      .mockResolvedValueOnce({
        rows: [
          { id: TASK_A, title: 'Task A', project_id: 'proj-1', work_accumulated_seconds: 3600 },
          { id: TASK_B, title: 'Task B', project_id: 'proj-1', work_accumulated_seconds: 1800 },
        ],
      }) // 3: FOR UPDATE (rivalidazione)
      .mockResolvedValueOnce({ rows: [{ numero: 5 }] }) // 4: MAX(numero)+1
      .mockResolvedValueOnce({ rows: [invoiceRow] }) // 5: INSERT invoices RETURNING
      .mockResolvedValueOnce({}) // 6: INSERT invoice_items (bulk)
      .mockResolvedValueOnce({}) // 7: UPDATE tasks SET invoice_id
      .mockResolvedValueOnce({}) // 8: UPDATE customers SET last_invoiced_at
      .mockResolvedValueOnce({}) // 9: COMMIT
      .mockResolvedValueOnce({ rows: [{}] }); // 10: pg_advisory_unlock

    // Post-commit, fuori dalla transazione: loadInvoiceItems (via `pool`, non
    // più lockClient, già rilasciato) e l'UPDATE finale di pdf_path.
    poolQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'item-1',
            invoice_id: 'invoice-1',
            task_id: TASK_A,
            task_title: 'Task A',
            project_id: 'proj-1',
            secondi_fatturati: 3600,
            tariffa_oraria_snapshot: '40.00',
            non_fatturabile: false,
          },
          {
            id: 'item-2',
            invoice_id: 'invoice-1',
            task_id: TASK_B,
            task_title: 'Task B',
            project_id: 'proj-1',
            secondi_fatturati: 1800,
            tariffa_oraria_snapshot: '40.00',
            non_fatturabile: true,
          },
        ],
      } as never) // loadInvoiceItems (per il PDF)
      .mockResolvedValueOnce({} as never); // UPDATE invoices SET pdf_path

    const invoice = await generateInvoice(COMPANY_ID, CUSTOMER_ID, [
      { taskId: TASK_A, nonFatturabile: false },
      { taskId: TASK_B, nonFatturabile: true },
    ]);

    // Numero progressivo: MAX(numero)+1 per company, non globale (vedi
    // UNIQUE(company_id, numero) in 0036) — qui il mock del DB restituisce
    // già 5, il test verifica che invoiceService lo propaghi inalterato nel
    // modello esposto, non lo ricalcoli altrove.
    expect(invoice.numero).toBe(5);
    // Totale ore = somma di entrambi i task, incluso quello non fatturabile
    // (resta nel documento con le sue ore, vedi regola di dominio).
    expect(invoice.totaleSecondi).toBe(5400);
    // Totale importo = solo la riga fatturabile (1h * 40): TASK_B non
    // fatturabile azzera il proprio importo nel totale, non le ore.
    expect(invoice.totaleImporto).toBe(40);

    // Numerazione per company (non globale): MAX(numero)+1 filtrato su
    // company_id, e l'INSERT usa esattamente i totali calcolati da questo
    // stesso passo, non un valore ricalcolato altrove.
    expect(client.query).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('MAX(numero)'),
      [COMPANY_ID],
    );
    expect(client.query).toHaveBeenNthCalledWith(5, expect.stringContaining('INSERT INTO invoices'), [
      COMPANY_ID,
      CUSTOMER_ID,
      5,
      5400,
      40,
      'pending',
    ]);

    // Snapshot: tariffa cliente null -> risolta dalla company (40), passata
    // com'è alla INSERT invoice_items per ENTRAMBE le righe (anche quella non
    // fatturabile: la tariffa_oraria_snapshot resta quella vera, vedi
    // commento in models/invoiceItem.ts).
    const insertItemsCall = client.query.mock.calls[5];
    expect(insertItemsCall[1]).toEqual(['invoice-1', 40, [TASK_A, TASK_B], ['proj-1', 'proj-1'], [3600, 1800], [false, true]]);

    // Lock definitivo dei task appena fatturati.
    expect(client.query).toHaveBeenNthCalledWith(7, expect.stringContaining('UPDATE tasks SET invoice_id'), [
      'invoice-1',
      [TASK_A, TASK_B],
    ]);
    // last_invoiced_at aggiornato per il cliente.
    expect(client.query).toHaveBeenNthCalledWith(8, expect.stringContaining('UPDATE customers'), [CUSTOMER_ID]);
    // Commit e rilascio del lock: SUBITO dopo il lavoro DB, PRIMA di
    // qualunque generazione del PDF (che infatti passa da poolQuery, non da
    // client.query, vedi sopra) — la connessione dedicata è già rilasciata a
    // questo punto.
    expect(client.query).toHaveBeenNthCalledWith(9, 'COMMIT');
    expect(client.query).toHaveBeenCalledTimes(10);
    expect(client.release).toHaveBeenCalled();

    // PDF generato e scritto su disco DOPO il commit (poolQuery, non più
    // lockClient): pdf_path aggiornato con una UPDATE separata via `pool`.
    expect(renderInvoicePdfMock).toHaveBeenCalled();
    expect(writeInvoicePdfToDiskMock).toHaveBeenCalledWith('invoice-1', Buffer.from('pdf'));
    expect(poolQuery).toHaveBeenNthCalledWith(2, expect.stringContaining('UPDATE invoices SET pdf_path'), [
      'invoice-1.pdf',
      'invoice-1',
    ]);

    // Notifica realtime dopo il commit: una sola query batch (getTasksByIds)
    // invece di N round-trip sequenziali, poi un emit per ciascun task
    // risolto.
    expect(getTasksByIdsMock).toHaveBeenCalledTimes(1);
    expect(getTasksByIdsMock).toHaveBeenCalledWith([TASK_A, TASK_B]);
    expect(emitTaskUpdated).toHaveBeenCalledTimes(2);
  });
});

describe('getBillableTasksSummary', () => {
  it('aggrega per cliente, risolvendo la tariffa a due livelli e segnalando i clienti senza tariffa', async () => {
    getCompanyByIdMock.mockResolvedValue(makeCompany({ tariffaOraria: 40 }));
    poolQuery.mockResolvedValue({
      rows: [
        // Cliente con tariffa propria (30): non deve mai ricadere sui 40 della company.
        { customer_id: 'cust-1', customer_name: 'Cliente Uno', customer_rate: '30.00', task_count: 2, total_seconds: '7200' },
        // Cliente senza tariffa propria: eredita i 40 della company.
        { customer_id: 'cust-2', customer_name: 'Cliente Due', customer_rate: null, task_count: 1, total_seconds: '3600' },
      ],
    } as never);

    const summary = await getBillableTasksSummary(COMPANY_ID, 'all');

    expect(summary.totalTasks).toBe(3);
    expect(summary.totalSeconds).toBe(10800);
    expect(summary.totalHours).toBe(3);
    expect(summary.hasCustomersWithoutRate).toBe(false);
    expect(summary.customers).toEqual([
      { customerId: 'cust-1', customerName: 'Cliente Uno', taskCount: 2, totalSeconds: 7200, totalHours: 2, tariffaOraria: 30, estimatedAmount: 60 },
      { customerId: 'cust-2', customerName: 'Cliente Due', taskCount: 1, totalSeconds: 3600, totalHours: 1, tariffaOraria: 40, estimatedAmount: 40 },
    ]);
    // 2h*30 + 1h*40 = 100.
    expect(summary.estimatedTotalAmount).toBe(100);
  });

  it('segnala hasCustomersWithoutRate quando né il cliente né la company hanno una tariffa', async () => {
    getCompanyByIdMock.mockResolvedValue(makeCompany({ tariffaOraria: null }));
    poolQuery.mockResolvedValue({
      rows: [{ customer_id: 'cust-1', customer_name: 'Cliente Uno', customer_rate: null, task_count: 1, total_seconds: '3600' }],
    } as never);

    const summary = await getBillableTasksSummary(COMPANY_ID, 'all');

    expect(summary.hasCustomersWithoutRate).toBe(true);
    expect(summary.customers[0].estimatedAmount).toBeNull();
    // Nessun importo calcolabile per l'unico cliente presente: la somma parziale resta 0, non un valore inventato.
    expect(summary.estimatedTotalAmount).toBe(0);
  });

  it('passa companyId, customerId e i confini del periodo alla query, null quando non applicabili', async () => {
    getCompanyByIdMock.mockResolvedValue(makeCompany({ tariffaOraria: 40 }));
    poolQuery.mockResolvedValue({ rows: [] } as never);

    await getBillableTasksSummary(COMPANY_ID, 'all', CUSTOMER_ID);
    expect(poolQuery).toHaveBeenCalledWith(expect.any(String), [COMPANY_ID, CUSTOMER_ID, null, null]);

    await getBillableTasksSummary(COMPANY_ID, 'this_month');
    const [, params] = poolQuery.mock.calls[1];
    expect(params).toEqual([COMPANY_ID, null, expect.any(Date), expect.any(Date)]);
  });
});

describe('getInvoicesSummary', () => {
  it('somma gli importi delle fatture del periodo senza lasciarlo calcolare al chiamante', async () => {
    poolQuery.mockResolvedValue({
      rows: [
        {
          id: 'invoice-1',
          numero: 3,
          data_generazione: new Date('2026-02-10T10:00:00.000Z'),
          customer_id: 'cust-1',
          customer_name: 'Cliente Uno',
          totale_importo: '120.50',
        },
        {
          id: 'invoice-2',
          numero: 4,
          data_generazione: new Date('2026-02-20T10:00:00.000Z'),
          customer_id: 'cust-2',
          customer_name: 'Cliente Due',
          totale_importo: '79.50',
        },
      ],
    } as never);

    const summary = await getInvoicesSummary(COMPANY_ID, 'this_month');

    expect(summary.count).toBe(2);
    expect(summary.totalAmount).toBe(200);
    expect(summary.invoices[0]).toEqual({
      id: 'invoice-1',
      numero: 3,
      dataGenerazione: '2026-02-10T10:00:00.000Z',
      customerId: 'cust-1',
      customerName: 'Cliente Uno',
      totaleImporto: 120.5,
    });
  });

  it("restituisce un riepilogo vuoto ('all', nessuna fattura) senza errori", async () => {
    poolQuery.mockResolvedValue({ rows: [] } as never);

    const summary = await getInvoicesSummary(COMPANY_ID, 'all');

    expect(summary).toEqual({ period: 'all', count: 0, totalAmount: 0, invoices: [] });
    expect(poolQuery).toHaveBeenCalledWith(expect.any(String), [COMPANY_ID, null, null, null]);
  });
});
