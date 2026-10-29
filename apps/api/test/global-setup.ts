import { ensureLocalDatabaseExists, resolveDatabaseUrl } from '../src/db/database-url.js';
import { runMigrations } from '../src/db/migrations.js';
import { loadTestEnv } from './helpers.js';

// Roda uma vez antes de todos os testes: garante o banco de teste com o esquema atual.
export default async function setup(): Promise<void> {
  loadTestEnv();
  const databaseUrl = resolveDatabaseUrl({ test: true });
  await ensureLocalDatabaseExists(databaseUrl);
  await runMigrations(databaseUrl);
}
