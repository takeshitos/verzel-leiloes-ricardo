// Comando: npm run db:migrate            (usa DATABASE_URL)
//          npm run db:migrate:test       (usa TEST_DATABASE_URL, banco terminado em _test)
import { describeError } from '../shared/describe-error.js';
import { loadLocalEnvFile } from '../shared/config.js';
import { ensureLocalDatabaseExists, resolveDatabaseUrl } from './database-url.js';
import { runMigrations } from './migrations.js';

loadLocalEnvFile();

try {
  const databaseUrl = resolveDatabaseUrl({ test: process.argv.includes('--test') });
  await ensureLocalDatabaseExists(databaseUrl);
  await runMigrations(databaseUrl);
} catch (error) {
  console.error(`Falha nas migrações: ${describeError(error)}`);
  process.exitCode = 1;
}
