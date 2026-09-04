// Forma dell'entità Company esposta dall'API: camelCase lato applicativo,
// coerente con project.ts/task.ts (vedi migrations/0013_create_companies_table.sql
// e 0030_add_dati_anagrafici_a_companies.sql per i campi anagrafici).
export interface Company {
  id: string;
  name: string;
  ownerId: string;
  // Tutti null finché l'owner non li compila dal drawer "Modifica dati
  // aziendali": nessuno di questi dati esiste per le aziende registrate prima
  // di 0030 (vedi commento della migration).
  ragioneSociale: string | null;
  piva: string | null;
  codiceFiscale: string | null;
  indirizzo: string | null;
  pec: string | null;
  createdAt: string;
}
