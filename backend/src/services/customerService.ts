import { pool } from '../db/pool';
import type { RateUnit } from '../models/company';
import type { Customer } from '../models/customer';
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
  };
}

const CUSTOMER_COLUMNS = 'id, company_id, name, description, created_at, last_invoiced_at, tariffa_oraria, tariffa_unita';
const CUSTOMER_SELECT = `SELECT ${CUSTOMER_COLUMNS} FROM customers`;

export async function listCustomersByCompany(companyId: string): Promise<Customer[]> {
  const result = await pool.query<CustomerRow>(`${CUSTOMER_SELECT} WHERE company_id = $1 ORDER BY name`, [
    companyId,
  ]);
  return result.rows.map(toCustomer);
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
  // Accoppiamento tariffaOraria/tariffaUnita già applicato dal controller
  // (stesso principio di UpdateCompanyInput in companyService.ts): il
  // service scrive quello che riceve senza rivalidare.
  tariffaOraria?: number | null;
  tariffaUnita?: RateUnit | null;
}

export async function createCustomer(companyId: string, input: CreateCustomerInput): Promise<Customer> {
  const result = await pool.query<CustomerRow>(
    `INSERT INTO customers (company_id, name, description, tariffa_oraria, tariffa_unita)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${CUSTOMER_COLUMNS}`,
    [companyId, input.name, input.description ?? null, input.tariffaOraria ?? null, input.tariffaUnita ?? null],
  );
  return toCustomer(result.rows[0]);
}

export interface UpdateCustomerInput {
  name: string;
  description?: string | null;
  tariffaOraria?: number | null;
  tariffaUnita?: RateUnit | null;
}

// Non tocca mai last_invoiced_at: nessun endpoint in questa fase la
// valorizza (vedi commento su Customer.lastInvoicedAt).
export async function updateCustomer(id: string, companyId: string, input: UpdateCustomerInput): Promise<Customer> {
  if (!isValidUuid(id)) {
    throw new CustomerNotFoundError(id);
  }

  const result = await pool.query<CustomerRow>(
    `UPDATE customers
     SET name = $3, description = $4, tariffa_oraria = $5, tariffa_unita = $6
     WHERE id = $1 AND company_id = $2
     RETURNING ${CUSTOMER_COLUMNS}`,
    [id, companyId, input.name, input.description ?? null, input.tariffaOraria ?? null, input.tariffaUnita ?? null],
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
