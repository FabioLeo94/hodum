import { pool } from '../db/pool';
import type { CurrencyCode, RateUnit } from '../models/company';
import type { Customer } from '../models/customer';
import { validateAndNormalizeCurrency } from '../utils/currency';
import { validateAndNormalizeRate } from '../utils/rateUnit';
import { isValidUuid } from '../utils/uuid';

// Stesso principio di ProjectNotFoundError/TaskNotFoundError: segnala "0
// righe trovate" al chiamante senza che il service conosca HTTP, il
// controller intercetta e decide lo status (404). Un id di un'altra company
// deve risultare indistinguibile da un id inesistente, non un 403.
export class CustomerNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Customer con id ${id} non trovato`);
    this.name = 'CustomerNotFoundError';
  }
}

// Segnala una coppia tariffaOraria/tariffaUnita non valida al chiamante senza
// che il service conosca HTTP: il controller la intercetta e decide lo status
// (422), stesso principio di CustomerNotFoundError sopra per il 404. Prima
// viveva come funzione validateTariffa in customerController.ts: la regola è
// di dominio (deriva dal CHECK di migration 0034), non di forma della
// richiesta, quindi appartiene al service, non al controller.
export class InvalidTariffaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTariffaError';
  }
}

// Validazione e normalizzazione condivisa da createCustomer/updateCustomer:
// regola comune a Company (vedi utils/rateUnit.ts, punto 3 della code review
// "niente logica nei controller" — prima duplicata qui e in
// companyController.ts), con InvalidTariffaError come tipo di errore proprio
// di questo service.
function validateAndNormalizeTariffa(
  tariffaOraria: number | null | undefined,
  tariffaUnita: RateUnit | null | undefined,
): { tariffaOraria: number | null; tariffaUnita: RateUnit | null } {
  return validateAndNormalizeRate(tariffaOraria, tariffaUnita, (message) => new InvalidTariffaError(message));
}

// Stesso principio di validateAndNormalizeTariffa sopra, ma per la valuta
// (0044): a differenza della tariffa, qui non c'è alcun accoppiamento da
// normalizzare, solo un valore opzionale (null = eredita dalla company).
function validateAndNormalizeValuta(valuta: string | null | undefined): CurrencyCode | null {
  return validateAndNormalizeCurrency(valuta, (message) => new InvalidTariffaError(message));
}

// Forma della riga così come esce da pg: snake_case, coerente con lo schema
// in migrations/0032_create_customers_table.sql.
interface CustomerRow {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  created_at: Date;
  last_invoiced_at: Date | null;
  // numeric in pg torna come stringa dal driver: convertita con Number(...)
  // in toCustomer, stesso principio di CompanyRow.tariffa_oraria in
  // companyService.ts.
  tariffa_oraria: string | null;
  tariffa_unita: RateUnit | null;
  valuta: CurrencyCode | null;
}

function toCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at.toISOString(),
    lastInvoicedAt: row.last_invoiced_at ? row.last_invoiced_at.toISOString() : null,
    tariffaOraria: row.tariffa_oraria === null ? null : Number(row.tariffa_oraria),
    tariffaUnita: row.tariffa_unita,
    valuta: row.valuta,
  };
}

const CUSTOMER_COLUMNS =
  'id, company_id, name, description, created_at, last_invoiced_at, tariffa_oraria, tariffa_unita, valuta';
const CUSTOMER_SELECT = `SELECT ${CUSTOMER_COLUMNS} FROM customers`;

export async function listCustomersByCompany(companyId: string): Promise<Customer[]> {
  const result = await pool.query<CustomerRow>(`${CUSTOMER_SELECT} WHERE company_id = $1 ORDER BY name`, [
    companyId,
  ]);
  return result.rows.map(toCustomer);
}

// Solo id e nome, senza dati economici (tariffa) né anagrafici: usata dalla
// dropdown di assegnazione cliente su un progetto (ProjectController.updateProject
// è @Security('manager'), a differenza delle rotte /customers che sono
// owner-only), stesso principio di ProjectSummary/listProjectsSummary lato
// frontend per la checklist di assegnazione progetti.
export interface CustomerSummary {
  id: string;
  name: string;
}

export async function listCustomerSummariesByCompany(companyId: string): Promise<CustomerSummary[]> {
  const result = await pool.query<CustomerSummary>(
    'SELECT id, name FROM customers WHERE company_id = $1 ORDER BY name',
    [companyId],
  );
  return result.rows;
}

export async function getCustomerById(id: string, companyId: string): Promise<Customer> {
  // Un id sintatticamente non valido non può comunque combaciare con nessuna
  // riga: intercettarlo qui evita che la colonna uuid lo rifiuti con un
  // errore del driver, stesso principio di getProjectById in projectService.ts.
  if (!isValidUuid(id)) {
    throw new CustomerNotFoundError(id);
  }

  const result = await pool.query<CustomerRow>(`${CUSTOMER_SELECT} WHERE id = $1 AND company_id = $2`, [
    id,
    companyId,
  ]);
  const row = result.rows[0];
  if (!row) {
    throw new CustomerNotFoundError(id);
  }
  return toCustomer(row);
}

export interface CreateCustomerInput {
  name: string;
  description?: string | null;
  // Grezzi come arrivano dal body della richiesta: validateAndNormalizeTariffa
  // (sopra) applica l'accoppiamento e può lanciare InvalidTariffaError, il
  // controller la intercetta per rispondere 422.
  tariffaOraria?: number | null;
  tariffaUnita?: RateUnit | null;
  // Opzionale per sempre (0044): se assente/null, la pre-fatturazione userà
  // la valuta della company di appartenenza (Company.valuta).
  valuta?: string | null;
}

export async function createCustomer(companyId: string, input: CreateCustomerInput): Promise<Customer> {
  const tariffa = validateAndNormalizeTariffa(input.tariffaOraria, input.tariffaUnita);
  const valuta = validateAndNormalizeValuta(input.valuta);
  const result = await pool.query<CustomerRow>(
    `INSERT INTO customers (company_id, name, description, tariffa_oraria, tariffa_unita, valuta)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${CUSTOMER_COLUMNS}`,
    [companyId, input.name, input.description ?? null, tariffa.tariffaOraria, tariffa.tariffaUnita, valuta],
  );
  return toCustomer(result.rows[0]);
}

export interface UpdateCustomerInput {
  name: string;
  description?: string | null;
  tariffaOraria?: number | null;
  tariffaUnita?: RateUnit | null;
  valuta?: string | null;
}

// Non tocca mai last_invoiced_at: nessun endpoint in questa fase la
// valorizza (vedi commento su Customer.lastInvoicedAt).
export async function updateCustomer(id: string, companyId: string, input: UpdateCustomerInput): Promise<Customer> {
  if (!isValidUuid(id)) {
    throw new CustomerNotFoundError(id);
  }
  const tariffa = validateAndNormalizeTariffa(input.tariffaOraria, input.tariffaUnita);
  const valuta = validateAndNormalizeValuta(input.valuta);

  const result = await pool.query<CustomerRow>(
    `UPDATE customers
     SET name = $3, description = $4, tariffa_oraria = $5, tariffa_unita = $6, valuta = $7
     WHERE id = $1 AND company_id = $2
     RETURNING ${CUSTOMER_COLUMNS}`,
    [id, companyId, input.name, input.description ?? null, tariffa.tariffaOraria, tariffa.tariffaUnita, valuta],
  );
  const row = result.rows[0];
  if (!row) {
    throw new CustomerNotFoundError(id);
  }
  return toCustomer(row);
}

export async function deleteCustomer(id: string, companyId: string): Promise<void> {
  if (!isValidUuid(id)) {
    throw new CustomerNotFoundError(id);
  }

  const result = await pool.query('DELETE FROM customers WHERE id = $1 AND company_id = $2', [id, companyId]);
  if (result.rowCount === 0) {
    throw new CustomerNotFoundError(id);
  }
}
