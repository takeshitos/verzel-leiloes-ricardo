// Comando: npm run db:seed        (usa DATABASE_URL)
//          npm run db:seed:test   (usa TEST_DATABASE_URL, banco terminado em _test)
import { describeError } from '../shared/describe-error.js';
import type { Pool } from 'pg';
import { loadLocalEnvFile } from '../shared/config.js';
import { describeDatabase, resolveDatabaseUrl } from './database-url.js';
import { createPool } from './pool.js';
import { runSeed } from './seed-data.js';

loadLocalEnvFile();

let pool: Pool | undefined;
try {
  const databaseUrl = resolveDatabaseUrl({ test: process.argv.includes('--test') });
  pool = createPool({ databaseUrl, maxConnections: 2 });
  console.log(`Seed em ${describeDatabase(databaseUrl)}...`);
  await runSeed(pool);
} catch (error) {
  console.error(`Falha no seed: ${describeError(error)}`);
  process.exitCode = 1;
} finally {
  await pool?.end();
}
