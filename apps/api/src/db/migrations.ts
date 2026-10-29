import { runner } from 'node-pg-migrate';
import { fileURLToPath } from 'node:url';
import { describeDatabase } from './database-url.js';

// apps/api/migrations, tanto a partir de src/db (dev) quanto de dist/db (produção).
const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations', import.meta.url));

/**
 * Aplica as migrações pendentes (arquivos .sql versionados em apps/api/migrations).
 * O node-pg-migrate roda as pendentes numa única transação e usa um advisory lock,
 * então duas instâncias subindo juntas não aplicam a mesma migração duas vezes.
 */
export async function runMigrations(databaseUrl: string): Promise<string[]> {
  console.log(`Aplicando migrações em ${describeDatabase(databaseUrl)}...`);

  const applied = await runner({
    databaseUrl,
    dir: MIGRATIONS_DIR,
    direction: 'up',
    migrationsTable: 'pgmigrations',
    checkOrder: true,
    log: (message: string) => console.log(`[migração] ${message}`),
  });

  const names = applied.map((migration) => migration.name);
  console.log(names.length > 0 ? `Migrações aplicadas: ${names.join(', ')}` : 'Nenhuma migração pendente.');
  return names;
}
