import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationsDir = join(__dirname, '..', '..', 'migrations');

function nextSequence(): string {
  if (!existsSync(migrationsDir)) {
    return '0001';
  }
  const numbers = readdirSync(migrationsDir)
    .map((f) => /^(\d{4})_/.exec(f)?.[1])
    .filter((n): n is string => n !== undefined)
    .map(Number);
  const next = (numbers.length > 0 ? Math.max(...numbers) : 0) + 1;
  return String(next).padStart(4, '0');
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function main(): void {
  const rawName = process.argv.slice(2).join(' ');
  if (!rawName) {
    console.error('Uso: npm run migrate:create -- "descrizione della migration"');
    process.exitCode = 1;
    return;
  }

  mkdirSync(migrationsDir, { recursive: true });

  const filename = `${nextSequence()}_${slugify(rawName)}.sql`;
  const filepath = join(migrationsDir, filename);

  writeFileSync(
    filepath,
    `-- ${rawName}
-- Descrivi qui perché questa migration serve, non cosa fanno le righe sotto.
-- Se contiene CREATE INDEX CONCURRENTLY (o un'altra operazione che rifiuta di
-- stare in una transazione), metti "-- no-transaction" come prima riga e
-- lascia UN SOLO statement in questo file.
`,
  );

  console.log(`Creata ${join('migrations', filename)}`);
}

main();
