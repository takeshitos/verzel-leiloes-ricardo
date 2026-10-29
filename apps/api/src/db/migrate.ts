// Comando: npm run db:migrate              (banco principal, DATABASE_URL)
//          npm run db:migrate:test         (TEST_DATABASE_URL, banco terminado em _test)
//          npm run db:migrate:anchor       (âncora de auditoria, ANCHOR_DATABASE_URL)
//          npm run db:migrate:anchor:test  (TEST_ANCHOR_DATABASE_URL)
import { describeError } from '../shared/describe-error.js';
import { loadLocalEnvFile } from '../shared/config.js';
import { ensureLocalDatabaseExists, resolveDatabaseUrl } from './database-url.js';
import { runMigrations } from './migrations.js';

loadLocalEnvFile();

const test = process.argv.includes('--test');
const anchor = process.argv.includes('--anchor');

try {
  const databaseUrl = resolveDatabaseUrl({ test, anchor });
  await ensureLocalDatabaseExists(databaseUrl);
  await runMigrations(databaseUrl, anchor ? 'anchor' : 'main');
} catch (error) {
  console.error(`Falha nas migrações: ${describeError(error)}`);
  process.exitCode = 1;
}
