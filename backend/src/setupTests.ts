// Eseguito prima di ogni file di test (vedi vitest.config.ts): valorizza le
// variabili lette a livello di modulo da db/pool.ts (DATABASE_URL) e
// tokenService.ts (JWT_SECRET) così l'import di quei moduli non lancia subito
// ("DATABASE_URL non impostata..."), anche nei test che poi sostituiscono
// db/pool.ts con un mock (vi.mock) e non toccano mai un Postgres reale.
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
process.env.JWT_SECRET ??= 'test-jwt-secret';
