// Forma dell'entità Company esposta dall'API: camelCase lato applicativo,
// coerente con project.ts/task.ts (vedi migrations/0013_create_companies_table.sql).
export interface Company {
  id: string;
  name: string;
  ownerId: string;
}
