import type { PoolClient } from 'pg';
import { pool } from '../db/pool';
import { getCompanyById } from './companyService';
import type { Company } from '../models/company';
import type { Customer } from '../models/customer';
import { getCustomerById } from './customerService';
import { getTasksByIds } from './taskService';
import { emitTaskUpdated } from '../realtime/io';
import { isValidUuid } from '../utils/uuid';
import { roundToCents } from '../utils/rounding';
import type { Invoice } from '../models/invoice';
import type { InvoiceItem } from '../models/invoiceItem';
import { renderInvoicePdf, resolveInvoicePdfPath, writeInvoicePdfToDisk } from './invoicePdfService';

export { CustomerNotFoundError } from './customerService';

// Nessuna tariffa risolvibile né sul cliente né sull'azienda (i due soli
// livelli ammessi, vedi resolveRateForCustomer sotto): non si può generare
// una pre-fattura senza sapere quanto vale un'ora di lavoro.
export class MissingRateError extends Error {
  constructor() {
    super("Nessuna tariffa oraria impostata: né sul cliente né sull'azienda");
    this.name = 'MissingRateError';
  }
}

export class InvoiceNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Invoice con id ${id} non trovata`);
    this.name = 'InvoiceNotFoundError';
  }
}

// Un taskId selezionato lato client non è (più) fatturabile al momento della
// rivalidazione dentro la transazione: stato cambiato, tempo azzerato, già
// fatturato da un'altra richiesta concorrente, o il task non appartiene al
// cliente/azienda indicati. Distinta da TaskNotFoundError di taskService: qui
// non è detto che il task non esista, solo che non passa più i criteri di
// fatturabilità.
export class TaskNotBillableError extends Error {
  constructor(public readonly id: string) {
    super(`Task con id ${id} non è (più) fatturabile`);
    this.name = 'TaskNotBillableError';
  }
}

export class NoTasksSelectedError extends Error {
  constructor() {
    super('Nessun task selezionato per la pre-fattura');
    this.name = 'NoTasksSelectedError';
  }
}

// Stesso principio di BackupInProgressError in backupService.ts: due
// generazioni concorrenti per la stessa company (due tab, o un doppio click)
// devono serializzarsi, non contendersi la numerazione progressiva.
export class InvoiceGenerationInProgressError extends Error {
  constructor() {
    super('Una generazione di pre-fattura per questa azienda è già in corso');
    this.name = 'InvoiceGenerationInProgressError';
  }
}

// Stessa tecnica di backupLockKeyExpression in backupService.ts (md5 ->
// bit(64) -> bigint), ma con chiave namespaced ('invoice:' + companyId invece
// di companyId nudo): senza il prefisso, una generazione di pre-fattura e un
// backup per la STESSA company produrrebbero la stessa chiave di
// pg_try_advisory_lock e si bloccherebbero a vicenda senza motivo, pur
// proteggendo risorse indipendenti.
function invoiceLockKeyExpression(placeholder: string): string {
  return `('x' || substr(md5('invoice:' || ${placeholder}), 1, 16))::bit(64)::bigint`;
}

async function acquireInvoiceLock(client: PoolClient, companyId: string): Promise<boolean> {
  const result = await client.query<{ acquired: boolean }>(
    `SELECT pg_try_advisory_lock(${invoiceLockKeyExpression('$1')}) AS acquired`,
    [companyId],
  );
  return result.rows[0].acquired;
}

async function releaseInvoiceLock(client: PoolClient, companyId: string): Promise<void> {
  await client.query(`SELECT pg_advisory_unlock(${invoiceLockKeyExpression('$1')})`, [companyId]);
}

// pdf_path è incluso nella riga grezza (serve a getInvoicePdfPath per
// ricostruire il path assoluto) ma toInvoice sotto non lo mappa mai nel
// modello esposto: resta un dettaglio server-side, mai serializzato in una
// response REST (vedi commento in models/invoice.ts).
interface InvoiceRow {
  id: string;
  company_id: string;
  customer_id: string;
  numero: number;
  data_generazione: Date;
  totale_secondi: number;
  // numeric in pg torna come stringa dal driver, stesso trattamento di
  // Customer.tariffaOraria in customerService.ts.
  totale_importo: string;
  pdf_path: string;
}

const INVOICE_COLUMNS =
  'id, company_id, customer_id, numero, data_generazione, totale_secondi, totale_importo, pdf_path';

// Sentinel scritto in pdf_path (colonna NOT NULL, niente NULL possibile senza
// una migration) finché il PDF non è ancora stato scritto su disco: sia
// appena dopo l'INSERT di una nuova fattura (il filename reale richiede gli
// item, generati solo dopo il commit, vedi generateInvoice) sia quando una
// generazione precedente è fallita. getInvoicePdfPath sotto lo riconosce e
// rigenera il PDF on-demand invece di provare a servire un path inesistente.
const PENDING_PDF_PATH = 'pending';

function toInvoice(row: InvoiceRow): Invoice {
  return {
    id: row.id,
    companyId: row.company_id,
    customerId: row.customer_id,
    numero: row.numero,
    dataGenerazione: row.data_generazione.toISOString(),
    totaleSecondi: row.totale_secondi,
    totaleImporto: Number(row.totale_importo),
  };
}

// L'UNICA implementazione della regola di dominio "tariffa del cliente se
// impostata, altrimenti quella della company, nessun terzo livello": pura
// (nessun I/O), così sia la variante che deve fallire con MissingRateError
// (resolveRate sotto, usata da resolveRateForCustomer e generateInvoice) sia
// quella che deve invece tollerare l'assenza di tariffa (getBillableTasksSummary,
// che aggrega più clienti e non può interrompersi per uno solo senza tariffa)
// condividono la stessa regola invece di reimplementarla ciascuna per conto
// proprio.
function pickRate(customerRate: number | null, companyRate: number | null): number | null {
  return customerRate ?? companyRate;
}

// Variante che fallisce: usata dove l'assenza di una tariffa risolvibile deve
// bloccare l'intera operazione (una pre-fattura non può avere un importo
// indefinito). Accetta gli oggetti già letti dal chiamante (Pick, non i tipi
// completi: qui serve solo tariffaOraria) invece di rileggerli via I/O quando
// il chiamante li ha già in mano (vedi generateInvoice, che passa customer/
// company appena caricati per altri motivi, senza un secondo giro di query).
function resolveRate(
  customer: Pick<Customer, 'tariffaOraria'>,
  company: Pick<Company, 'tariffaOraria'> | null,
): number {
  const rate = pickRate(customer.tariffaOraria, company?.tariffaOraria ?? null);
  if (rate === null) {
    throw new MissingRateError();
  }
  return rate;
}

// Wrapper con I/O di resolveRate, per chi non ha già in mano gli oggetti
// customer/company (a differenza di generateInvoice). Legge la company solo
// se serve: quando il cliente ha già una propria tariffa, resolveRate la
// userebbe comunque per prima (vedi pickRate), quindi risparmiare la query
// non cambia il risultato — stessa ottimizzazione già presente prima di
// questo refactor.
export async function resolveRateForCustomer(customerId: string, companyId: string): Promise<number> {
  const customer = await getCustomerById(customerId, companyId);
  if (customer.tariffaOraria !== null) {
    return resolveRate(customer, null);
  }
  const company = await getCompanyById(companyId);
  return resolveRate(customer, company);
}

// Periodo condiviso dai due tool di sola lettura dell'assistente
// (get_billable_tasks_summary, get_invoices_summary): 'all' non filtra affatto,
// gli altri due delimitano un mese di calendario. Confini calcolati
// sull'orario locale del server (stesso principio di daysBetweenCalendarDates
// in taskService.ts) e passati come timestamptz: node-pg serializza l'istante
// reale del Date, non serve una conversione manuale a UTC.
export type BillingPeriod = 'all' | 'this_month' | 'last_month';

function resolvePeriodRange(period: BillingPeriod): { from: Date; to: Date } | null {
  if (period === 'all') return null;
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  if (period === 'this_month') {
    return { from: currentMonthStart, to: new Date(now.getFullYear(), now.getMonth() + 1, 1) };
  }
  return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: currentMonthStart };
}

export interface BillableTask {
  id: string;
  title: string;
  workAccumulatedSeconds: number;
  projectId: string;
  projectName: string;
}

interface BillableTaskRow {
  id: string;
  title: string;
  work_accumulated_seconds: number;
  project_id: string;
  project_name: string;
}

// Stessa regola di business applicata due volte (qui per la UI di selezione,
// dentro generateInvoice per la rivalidazione atomica): stato completed o
// rejected, tempo accumulato positivo, non ancora fatturato, progetto del
// cliente/company indicati. getCustomerById valida a monte che il cliente
// esista e appartenga alla company del richiedente (CustomerNotFoundError
// altrimenti), stesso principio di getProjectById in listTasksByProject.
export async function listBillableTasksForCustomer(customerId: string, companyId: string): Promise<BillableTask[]> {
  await getCustomerById(customerId, companyId);

  const result = await pool.query<BillableTaskRow>(
    `SELECT t.id, t.title, t.work_accumulated_seconds, t.project_id, p.name AS project_name
     FROM tasks t
     JOIN task_status ts ON ts.id = t.status
     JOIN projects p ON p.id = t.project_id
     WHERE p.customer_id = $1
       AND p.company_id = $2
       AND ts.name IN ('completed', 'rejected')
       AND t.work_accumulated_seconds > 0
       AND t.invoice_id IS NULL
     ORDER BY t.title`,
    [customerId, companyId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    workAccumulatedSeconds: row.work_accumulated_seconds,
    projectId: row.project_id,
    projectName: row.project_name,
  }));
}

export interface BillableCustomerSummary {
  customerId: string;
  customerName: string;
  taskCount: number;
  totalSeconds: number;
  totalHours: number;
  // Tariffa risolta a due livelli (cliente, poi company), stessa regola di
  // resolveRateForCustomer/generateInvoice sopra: null solo se nessuna delle
  // due è impostata.
  tariffaOraria: number | null;
  // null se tariffaOraria è null: nessuna cifra economica risulta calcolabile
  // per questo cliente, non uno zero che suggerirebbe "niente da fatturare".
  estimatedAmount: number | null;
}

export interface BillableTasksSummary {
  period: BillingPeriod;
  totalTasks: number;
  totalSeconds: number;
  totalHours: number;
  // Somma dei soli estimatedAmount non-null: parziale (non l'intero monte
  // ore) se hasCustomersWithoutRate è true.
  estimatedTotalAmount: number;
  hasCustomersWithoutRate: boolean;
  customers: BillableCustomerSummary[];
}

// Usata dal tool "get_billable_tasks_summary" dell'assistente: stessa regola
// di fatturabilità di listBillableTasksForCustomer (completed/rejected, tempo
// accumulato positivo, non ancora fatturato, progetto legato a un cliente) ma
// aggregata per TUTTI i clienti dell'azienda (o uno solo se customerId è
// passato) invece di uno alla volta, e con la tariffa risolta via SQL invece
// di N chiamate separate a resolveRateForCustomer. Il conteggio, le ore e
// l'importo sono calcolati qui e non lasciati al modello: stesso principio di
// buildMutationConfirmation in assistantService.ts, un modello locale non va
// lasciato fare somme su un elenco di righe.
// Il periodo filtra su status_changed_at (non completed_at): completed_at
// resta null per i task rejected (vedi commento in taskService.updateTaskStatus),
// mentre status_changed_at si aggiorna su ENTRAMBE le transizioni terminali,
// quindi è l'unico campo che rappresenta in modo uniforme "quando questo task
// è diventato definitivo" per l'intero insieme completed+rejected filtrato qui.
export async function getBillableTasksSummary(
  companyId: string,
  period: BillingPeriod,
  customerId?: string,
): Promise<BillableTasksSummary> {
  const range = resolvePeriodRange(period);
  const result = await pool.query<{
    customer_id: string;
    customer_name: string;
    customer_rate: string | null;
    task_count: number;
    total_seconds: string;
  }>(
    `SELECT c.id AS customer_id, c.name AS customer_name, c.tariffa_oraria AS customer_rate,
            COUNT(*)::int AS task_count, COALESCE(SUM(t.work_accumulated_seconds), 0)::bigint AS total_seconds
     FROM tasks t
     JOIN task_status ts ON ts.id = t.status
     JOIN projects p ON p.id = t.project_id
     JOIN customers c ON c.id = p.customer_id
     WHERE p.company_id = $1
       AND ts.name IN ('completed', 'rejected')
       AND t.work_accumulated_seconds > 0
       AND t.invoice_id IS NULL
       AND ($2::uuid IS NULL OR c.id = $2)
       AND ($3::timestamptz IS NULL OR t.status_changed_at >= $3)
       AND ($4::timestamptz IS NULL OR t.status_changed_at < $4)
     GROUP BY c.id, c.name, c.tariffa_oraria
     ORDER BY c.name`,
    [companyId, customerId ?? null, range?.from ?? null, range?.to ?? null],
  );

  const company = await getCompanyById(companyId);
  const companyRate = company?.tariffaOraria ?? null;

  let totalTasks = 0;
  let totalSeconds = 0;
  let estimatedTotalAmount = 0;
  let hasCustomersWithoutRate = false;
  const customers: BillableCustomerSummary[] = result.rows.map((row) => {
    const customerRate = row.customer_rate === null ? null : Number(row.customer_rate);
    // Stessa regola pura di resolveRate sopra, qui nella variante non
    // lanciante (pickRate): un cliente senza tariffa non deve interrompere
    // l'intero riepilogo, solo segnalarsi via hasCustomersWithoutRate.
    const tariffa = pickRate(customerRate, companyRate);
    const seconds = Number(row.total_seconds);
    const estimatedAmount = tariffa === null ? null : roundToCents((seconds / 3600) * tariffa);
    totalTasks += row.task_count;
    totalSeconds += seconds;
    if (estimatedAmount === null) {
      hasCustomersWithoutRate = true;
    } else {
      estimatedTotalAmount += estimatedAmount;
    }
    return {
      customerId: row.customer_id,
      customerName: row.customer_name,
      taskCount: row.task_count,
      totalSeconds: seconds,
      totalHours: roundToCents(seconds / 3600),
      tariffaOraria: tariffa,
      estimatedAmount,
    };
  });

  return {
    period,
    totalTasks,
    totalSeconds,
    totalHours: roundToCents(totalSeconds / 3600),
    estimatedTotalAmount: roundToCents(estimatedTotalAmount),
    hasCustomersWithoutRate,
    customers,
  };
}

// Righe di dettaglio con taskTitle denormalizzato via JOIN, riusata sia da
// getInvoiceWithItems (lettura pubblica) sia da generateInvoice (per
// costruire il PDF prima del commit): stessa query, client diverso
// (PoolClient dentro la transazione, altrimenti pool).
async function loadInvoiceItems(
  queryable: Pick<PoolClient, 'query'>,
  invoiceId: string,
): Promise<InvoiceItem[]> {
  const result = await queryable.query<{
    id: string;
    invoice_id: string;
    task_id: string;
    task_title: string;
    project_id: string;
    secondi_fatturati: number;
    tariffa_oraria_snapshot: string;
    non_fatturabile: boolean;
  }>(
    `SELECT ii.id, ii.invoice_id, ii.task_id, t.title AS task_title, ii.project_id,
            ii.secondi_fatturati, ii.tariffa_oraria_snapshot, ii.non_fatturabile
     FROM invoice_items ii
     JOIN tasks t ON t.id = ii.task_id
     WHERE ii.invoice_id = $1
     ORDER BY t.title`,
    [invoiceId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    invoiceId: row.invoice_id,
    taskId: row.task_id,
    taskTitle: row.task_title,
    projectId: row.project_id,
    secondiFatturati: row.secondi_fatturati,
    tariffaOrariaSnapshot: Number(row.tariffa_oraria_snapshot),
    nonFatturabile: row.non_fatturabile,
  }));
}

export interface TaskSelectionInput {
  taskId: string;
  nonFatturabile: boolean;
}

// Cuore della feature: genera una pre-fattura in una transazione DB (client
// dedicato, BEGIN/COMMIT/ROLLBACK) che fa SOLO lavoro sul database e va in
// COMMIT il prima possibile — niente PDF né altro I/O su disco tenuto sotto i
// lock di riga (FOR UPDATE) o il lock advisory di company, che altrimenti
// resterebbero presi più a lungo del necessario, allungando l'attesa di una
// generateInvoice concorrente sulla stessa company o di un update concorrente
// su uno dei task coinvolti. Il PDF si genera DOPO, fuori dalla transazione
// (passo 9 sotto): un suo fallimento non invalida la fattura già committata,
// vedi il commento lì per la strategia scelta. Passi numerati nei commenti
// sotto, stesso ordine del piano approvato.
export async function generateInvoice(
  companyId: string,
  customerId: string,
  taskSelections: TaskSelectionInput[],
): Promise<Invoice> {
  // Verifica di appartenenza del cliente PRIMA di aprire una connessione
  // dedicata e acquisire il lock: un customerId inesistente o di un'altra
  // company non deve arrivare a contendersi il lock per niente. L'oggetto è
  // riusato più sotto sia per risolvere la tariffa sia per il PDF, invece di
  // rileggerlo più volte nella stessa generazione.
  const customer = await getCustomerById(customerId, companyId);

  const uniqueTaskIds = [...new Set(taskSelections.map((s) => s.taskId))];
  if (uniqueTaskIds.length === 0) {
    throw new NoTasksSelectedError();
  }
  const invalidId = uniqueTaskIds.find((id) => !isValidUuid(id));
  if (invalidId) {
    throw new TaskNotBillableError(invalidId);
  }
  const nonFatturabileByTaskId = new Map(taskSelections.map((s) => [s.taskId, s.nonFatturabile]));

  // Stesso schema di runBackup in backupService.ts: client dedicato tenuto
  // aperto per tutta la durata della transazione (pg_try_advisory_lock è
  // legato alla SESSIONE che lo acquisisce), rilasciato subito dopo il commit
  // (vedi il finally sotto) — non più tenuto anche durante la generazione del
  // PDF, a differenza di prima di questo fix.
  const lockClient = await pool.connect();
  let lockAcquired = false;
  // Assegnati dentro il try, usati dopo (passi 9 e 10): la '!' documenta che
  // sono definitivamente valorizzati solo se il try arriva al COMMIT senza
  // lanciare — altrimenti il catch rilancia e la funzione esce prima di
  // usarli.
  let invoice!: Invoice;
  let company!: Company;
  let taskIds!: string[];
  try {
    lockAcquired = await acquireInvoiceLock(lockClient, companyId);
    if (!lockAcquired) {
      throw new InvoiceGenerationInProgressError();
    }

    await lockClient.query('BEGIN');

    // 2. Rivalidazione DENTRO la transazione: stato, tempo accumulato,
    // invoice_id ancora null, progetto del cliente/company giusti. FOR UPDATE
    // blocca le righe selezionate per la durata della transazione, difesa in
    // profondità oltre al lock advisory (che serializza le generazioni ma non
    // impedisce di per sé una scrittura concorrente sulle stesse righe da
    // un'altra query).
    const rowsResult = await lockClient.query<{
      id: string;
      title: string;
      project_id: string;
      work_accumulated_seconds: number;
    }>(
      `SELECT t.id, t.title, t.project_id, t.work_accumulated_seconds
       FROM tasks t
       JOIN task_status ts ON ts.id = t.status
       JOIN projects p ON p.id = t.project_id
       WHERE t.id = ANY($1::uuid[])
         AND p.customer_id = $2
         AND p.company_id = $3
         AND ts.name IN ('completed', 'rejected')
         AND t.work_accumulated_seconds > 0
         AND t.invoice_id IS NULL
       FOR UPDATE OF t`,
      [uniqueTaskIds, customerId, companyId],
    );
    const foundIds = new Set(rowsResult.rows.map((row) => row.id));
    const missingId = uniqueTaskIds.find((id) => !foundIds.has(id));
    if (missingId) {
      throw new TaskNotBillableError(missingId);
    }

    // 3. Tariffa risolta una volta per l'intera fattura tramite l'unica
    // implementazione della regola a due livelli (resolveRate, vedi sopra):
    // niente più una copia inline qui. company letta qui (serve comunque dopo
    // il commit per il PDF, passo 9), customer già letto sopra.
    const resolvedCompany = await getCompanyById(companyId);
    if (!resolvedCompany) {
      // Non dovrebbe accadere: companyId è quello del richiedente autenticato
      // (già risolto da expressAuthentication), ma un controllo esplicito
      // evita un accesso a proprietà di null più sotto se mai capitasse.
      throw new Error(`Company con id ${companyId} non trovata durante la generazione della pre-fattura`);
    }
    company = resolvedCompany;
    const tariffa = resolveRate(customer, company);

    // 4. Numerazione progressiva per company: MAX(numero)+1 letto DENTRO la
    // stessa transazione che detiene il lock advisory di company, così due
    // generazioni concorrenti per la stessa company (già escluse dal lock,
    // ma difesa in profondità) non potrebbero comunque leggere lo stesso
    // MAX. pdf_path resta il sentinel PENDING_PDF_PATH: il PDF si genera solo
    // al passo 9, dopo il commit.
    const numeroResult = await lockClient.query<{ numero: number }>(
      'SELECT COALESCE(MAX(numero), 0) + 1 AS numero FROM invoices WHERE company_id = $1',
      [companyId],
    );
    const numero = numeroResult.rows[0].numero;

    let totaleSecondi = 0;
    let totaleImporto = 0;
    taskIds = [];
    const projectIds: string[] = [];
    const secondiArr: number[] = [];
    const nonFattArr: boolean[] = [];
    for (const row of rowsResult.rows) {
      const nonFatturabile = nonFatturabileByTaskId.get(row.id) ?? false;
      totaleSecondi += row.work_accumulated_seconds;
      if (!nonFatturabile) {
        // Arrotondato RIGA PER RIGA, non alla fine sulla somma raw: così
        // totaleImporto (somma dei valori già arrotondati) coincide sempre
        // con la somma di quanto invoicePdfService stampa riga per riga
        // (stessa formula, stesso roundToCents lì), invece di poter divergere
        // per uno o due centesimi come prima di questo fix.
        totaleImporto += roundToCents((row.work_accumulated_seconds / 3600) * tariffa);
      }
      taskIds.push(row.id);
      projectIds.push(row.project_id);
      secondiArr.push(row.work_accumulated_seconds);
      nonFattArr.push(nonFatturabile);
    }
    // Un secondo roundToCents qui non ri-decide l'arrotondamento (i valori
    // sommati sono già a 2 decimali): ripulisce solo il rumore residuo della
    // virgola mobile (es. 10.10 + 10.20 = 20.299999999999997).
    totaleImporto = roundToCents(totaleImporto);

    const insertedInvoice = await lockClient.query<InvoiceRow>(
      `INSERT INTO invoices (company_id, customer_id, numero, totale_secondi, totale_importo, pdf_path)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${INVOICE_COLUMNS}`,
      [companyId, customerId, numero, totaleSecondi, totaleImporto, PENDING_PDF_PATH],
    );
    const invoiceRow = insertedInvoice.rows[0];

    // 5. Insert bulk delle righe invoice_items via unnest su array paralleli,
    // stesso pattern del bulk insert in setTaskAssignees/setProjectAssignments
    // (un solo round-trip invece di uno per riga).
    await lockClient.query(
      `INSERT INTO invoice_items (invoice_id, task_id, project_id, secondi_fatturati, tariffa_oraria_snapshot, non_fatturabile)
       SELECT $1, tid, pid, sec, $2, nf
       FROM unnest($3::uuid[], $4::uuid[], $5::int[], $6::boolean[]) AS u(tid, pid, sec, nf)`,
      [invoiceRow.id, tariffa, taskIds, projectIds, secondiArr, nonFattArr],
    );

    // 6. Lock definitivo dei task: invoice_id scritto una sola volta (vedi
    // commento su Task.invoiceId in models/task.ts).
    await lockClient.query('UPDATE tasks SET invoice_id = $1 WHERE id = ANY($2::uuid[])', [invoiceRow.id, taskIds]);

    // 7. last_invoiced_at aggiornato per il cliente (colonna pensata apposta
    // per questo, vedi commento in models/customer.ts).
    await lockClient.query('UPDATE customers SET last_invoiced_at = now() WHERE id = $1', [customerId]);

    // 8. Commit: da qui in poi la pre-fattura è definitiva sul DB, con
    // pdf_path ancora PENDING_PDF_PATH (nessuna scrittura su disco è ancora
    // avvenuta, vedi passo 9 sotto). Tutto e solo il lavoro DB-bound finisce
    // qui, apposta prima di qualunque I/O su disco: vedi il commento in testa
    // alla funzione.
    invoice = toInvoice(invoiceRow);
    await lockClient.query('COMMIT');
  } catch (err) {
    await lockClient.query('ROLLBACK').catch(() => {
      // ROLLBACK su una transazione mai iniziata (es. lock non acquisito,
      // errore prima del BEGIN) fallisce in modo innocuo: non deve mascherare
      // l'errore originale che ha causato il catch.
    });
    throw err;
  } finally {
    // Lock advisory e connessione dedicata rilasciati SUBITO dopo il commit
    // (o il rollback), non dopo la generazione del PDF sotto: quel lavoro
    // CPU/disco-bound non ha bisogno di alcuna garanzia transazionale, e
    // tenerlo sotto lock allungherebbe solo l'attesa di una generateInvoice
    // concorrente sulla stessa company o di un update concorrente su uno dei
    // task appena lockati.
    if (lockAcquired) {
      try {
        await releaseInvoiceLock(lockClient, companyId);
      } catch (err) {
        console.error(`Impossibile rilasciare il lock di fatturazione per l'azienda ${companyId}:`, err);
      }
    }
    lockClient.release();
  }

  // 9. Genera il PDF DOPO il commit, fuori dalla transazione e senza alcun
  // lock preso: usa `pool` (non più lockClient, già rilasciato sopra). Se
  // fallisce (pdfkit, disco pieno, errore di connessione sull'UPDATE finale,
  // ecc.) la fattura resta comunque valida nel DB con pdf_path=PENDING_PDF_PATH
  // — scelta deliberata invece di un rollback (impossibile: la transazione è
  // già committata) o un retry automatico qui: la prossima richiesta del PDF
  // (getInvoicePdfPath sotto) lo rigenera on-demand dai dati già persistiti
  // (invoice + invoice_items + company + customer), che bastano da soli a
  // ricostruirlo interamente, senza alcun dato perso.
  try {
    const items = await loadInvoiceItems(pool, invoice.id);
    const pdfBuffer = await renderInvoicePdf(invoice, items, company, customer);
    const filename = await writeInvoicePdfToDisk(invoice.id, pdfBuffer);
    await pool.query('UPDATE invoices SET pdf_path = $1 WHERE id = $2', [filename, invoice.id]);
  } catch (err) {
    console.error(
      `Generazione PDF fallita per la pre-fattura ${invoice.id} (pdf_path resta '${PENDING_PDF_PATH}', verrà rigenerato alla prossima richiesta)`,
      err,
    );
  }

  // 10. Notifica realtime DOPO il commit, fuori dalla transazione: un
  // fallimento qui non deve far percepire come "non riuscita" una
  // generazione già committata (stesso principio già applicato ai try/catch
  // attorno a notifyProjectTeam/notifyUsers in taskService.ts). Una sola
  // query batch (getTasksByIds) invece di N round-trip sequenziali —
  // getTaskById ne farebbe 2 ciascuno, 2N in totale prima di questo fix — gli
  // emit restano per-task perché lo richiede l'API di emitTaskUpdated.
  try {
    const tasks = await getTasksByIds(taskIds);
    for (const task of tasks) {
      emitTaskUpdated(task);
    }
  } catch (err) {
    console.error(`Notifica realtime task:updated fallita dopo la fatturazione (invoice ${invoice.id})`, err);
  }

  return invoice;
}

export async function listInvoicesByCompany(companyId: string): Promise<Invoice[]> {
  const result = await pool.query<InvoiceRow>(
    `SELECT ${INVOICE_COLUMNS} FROM invoices WHERE company_id = $1 ORDER BY numero DESC`,
    [companyId],
  );
  return result.rows.map(toInvoice);
}

export interface InvoiceSummaryItem {
  id: string;
  numero: number;
  dataGenerazione: string;
  customerId: string;
  customerName: string;
  totaleImporto: number;
}

export interface InvoicesSummary {
  period: BillingPeriod;
  count: number;
  // Somma di totaleImporto sulle fatture del periodo, arrotondata qui (non
  // lasciata sommare al modello, stesso principio di getBillableTasksSummary
  // sopra): a differenza di estimatedTotalAmount lì, qui non c'è alcun caso
  // "importo non calcolabile" perché totaleImporto è uno snapshot già scritto
  // in DB al momento della generazione, mai null.
  totalAmount: number;
  invoices: InvoiceSummaryItem[];
}

// Usata dal tool "get_invoices_summary" dell'assistente: aggrega le
// pre-fatture GIÀ emesse (a differenza di getBillableTasksSummary sopra, che
// riguarda invece i task ancora da fatturare) per periodo ed eventualmente
// per cliente. Il periodo filtra su data_generazione (colonna reale della
// fattura, a differenza di status_changed_at usato in
// getBillableTasksSummary: qui non serve un ragionamento su completed vs
// rejected, ogni invoice ha sempre una data_generazione propria).
export async function getInvoicesSummary(
  companyId: string,
  period: BillingPeriod,
  customerId?: string,
): Promise<InvoicesSummary> {
  const range = resolvePeriodRange(period);
  const result = await pool.query<{
    id: string;
    numero: number;
    data_generazione: Date;
    customer_id: string;
    customer_name: string;
    totale_importo: string;
  }>(
    `SELECT i.id, i.numero, i.data_generazione, i.customer_id, c.name AS customer_name, i.totale_importo
     FROM invoices i
     JOIN customers c ON c.id = i.customer_id
     WHERE i.company_id = $1
       AND ($2::uuid IS NULL OR i.customer_id = $2)
       AND ($3::timestamptz IS NULL OR i.data_generazione >= $3)
       AND ($4::timestamptz IS NULL OR i.data_generazione < $4)
     ORDER BY i.data_generazione DESC`,
    [companyId, customerId ?? null, range?.from ?? null, range?.to ?? null],
  );

  const invoices: InvoiceSummaryItem[] = result.rows.map((row) => ({
    id: row.id,
    numero: row.numero,
    dataGenerazione: row.data_generazione.toISOString(),
    customerId: row.customer_id,
    customerName: row.customer_name,
    totaleImporto: Number(row.totale_importo),
  }));
  const totalAmount = roundToCents(invoices.reduce((sum, invoice) => sum + invoice.totaleImporto, 0));

  return { period, count: invoices.length, totalAmount, invoices };
}

export interface InvoiceWithItems {
  invoice: Invoice;
  items: InvoiceItem[];
}

async function getInvoiceRow(invoiceId: string, companyId: string): Promise<InvoiceRow> {
  if (!isValidUuid(invoiceId)) {
    throw new InvoiceNotFoundError(invoiceId);
  }
  const result = await pool.query<InvoiceRow>(
    `SELECT ${INVOICE_COLUMNS} FROM invoices WHERE id = $1 AND company_id = $2`,
    [invoiceId, companyId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new InvoiceNotFoundError(invoiceId);
  }
  return row;
}

export async function getInvoiceWithItems(invoiceId: string, companyId: string): Promise<InvoiceWithItems> {
  const row = await getInvoiceRow(invoiceId, companyId);
  const items = await loadInvoiceItems(pool, invoiceId);
  return { invoice: toInvoice(row), items };
}

// Ricostruisce il PDF da zero dai dati già persistiti (invoice + invoice_items
// + company + customer, tutti recuperabili dal solo InvoiceRow) e aggiorna
// pdf_path col filename risultante: usata sia quando pdf_path è ancora il
// sentinel PENDING_PDF_PATH (una generateInvoice il cui passo 9 è fallito)
// sia da regenerateMissingInvoicePdf sotto (il file risultava presente in DB
// ma è sparito dal filesystem). Nessuna transazione: la fattura esiste già,
// questa è pura rigenerazione di un artefatto derivato, non ha bisogno di
// atomicità con altre scritture.
async function regenerateInvoicePdf(row: InvoiceRow): Promise<string> {
  const [items, company, customer] = await Promise.all([
    loadInvoiceItems(pool, row.id),
    getCompanyById(row.company_id),
    getCustomerById(row.customer_id, row.company_id),
  ]);
  if (!company) {
    // Non dovrebbe accadere: company_id viene dalla riga invoices stessa, ma
    // stesso controllo esplicito già fatto in generateInvoice per lo stesso
    // motivo (mai un accesso a proprietà di null più sotto).
    throw new Error(`Company con id ${row.company_id} non trovata durante la rigenerazione del PDF della fattura ${row.id}`);
  }
  const pdfBuffer = await renderInvoicePdf(toInvoice(row), items, company, customer);
  const filename = await writeInvoicePdfToDisk(row.id, pdfBuffer);
  await pool.query('UPDATE invoices SET pdf_path = $1 WHERE id = $2', [filename, row.id]);
  return filename;
}

// Verifica ownership (id + company_id, stesso principio di
// getCustomerById/getProjectById) e restituisce il path assoluto sul
// filesystem, mai esposto direttamente dal modello Invoice (vedi commento in
// models/invoice.ts). Consumata solo dalla rotta Express raw di streaming
// (vedi app.ts), non da un controller tsoa.
//
// pdf_path === PENDING_PDF_PATH (vedi generateInvoice, passo 9: la
// generazione del PDF avviene DOPO il commit e può fallire senza invalidare
// la fattura) è rigenerato qui, on-demand, invece di rispondere con un file
// inesistente: il documento è interamente ricostruibile dai dati già in DB,
// non serve alcun job di retry in background per una feature a basso volume
// come questa.
export async function getInvoicePdfPath(invoiceId: string, companyId: string): Promise<string> {
  const row = await getInvoiceRow(invoiceId, companyId);
  if (row.pdf_path === PENDING_PDF_PATH) {
    const filename = await regenerateInvoicePdf(row);
    return resolveInvoicePdfPath(filename);
  }
  return resolveInvoicePdfPath(row.pdf_path);
}

// Usata solo dalla rotta Express di streaming (app.ts) quando readFile
// fallisce con ENOENT nonostante pdf_path punti a un filename non-pending
// (file rimosso a mano dal disco, o backend/invoices/ ripulita a mano): stessa
// rigenerazione di getInvoicePdfPath per il caso PENDING_PDF_PATH, ma forzata
// indipendentemente dal valore corrente di pdf_path.
export async function regenerateMissingInvoicePdf(invoiceId: string, companyId: string): Promise<string> {
  const row = await getInvoiceRow(invoiceId, companyId);
  const filename = await regenerateInvoicePdf(row);
  return resolveInvoicePdfPath(filename);
}
