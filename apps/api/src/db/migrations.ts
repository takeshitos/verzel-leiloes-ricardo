import { runner } from 'node-pg-migrate';
import { fileURLToPath } from 'node:url';
import { describeDatabase } from './database-url.js';

// apps/api/migrations (banco principal) e apps/api/migrations-anchor (âncora de auditoria),
// tanto a partir de src/db (dev) quanto de dist/db (produção).
const MIGRATIONS_DIRS = {
  main: fileURLToPath(new URL('../../migrations', import.meta.url)),
  anchor: fileURLToPath(new URL('../../migrations-anchor', import.meta.url)),
};

/**
 * Aplica as migrações pendentes (arquivos .sql versionados).
 * O node-pg-migrate roda as pendentes numa única transação e usa um advisory lock,
 * então duas instâncias subindo juntas não aplicam a mesma migração duas vezes.
 */
export async function runMigrations(databaseUrl: string, target: 'main' | 'anchor' = 'main'): Promise<string[]> {
  const label = target === 'anchor' ? ' (âncora)' : '';
  console.log(`Aplicando migrações${label} em ${describeDatabase(databaseUrl)}...`);

  const applied = await runner({
    databaseUrl,
    dir: MIGRATIONS_DIRS[target],
    direction: 'up',
    migrationsTable: 'pgmigrations',
    checkOrder: true,
    log: (message: string) => console.log(`[migração${label}] ${message}`),
  });

  const names = applied.map((migration) => migration.name);
  console.log(names.length > 0 ? `Migrações aplicadas${label}: ${names.join(', ')}` : `Nenhuma migração pendente${label}.`);
  return names;
}
