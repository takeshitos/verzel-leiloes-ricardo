// Servidor do E2E: a aplicação real (API + build do web + Socket.IO + job de liquidação),
// apontada SÓ para os bancos de teste e para um imitador local da API do museu.
// Nunca roda contra produção: recusa banco cujo nome não termina em "_test".
import { fileURLToPath } from 'node:url';
import { runSeed } from '../apps/api/src/db/seed-data.js';
import { createTestPool, resetDatabase } from '../apps/api/test/helpers.js';
import { startCatalogStub } from '../apps/api/test/catalog-stub.js';

const apiDir = fileURLToPath(new URL('../apps/api/', import.meta.url));
process.chdir(apiDir); // .env da API e caminhos relativos
process.loadEnvFile('.env');

const testDatabase = process.env.TEST_DATABASE_URL ?? '';
const testAnchor = process.env.TEST_ANCHOR_DATABASE_URL ?? '';
for (const [name, url] of [
  ['TEST_DATABASE_URL', testDatabase],
  ['TEST_ANCHOR_DATABASE_URL', testAnchor],
]) {
  const database = url ? new URL(url).pathname.slice(1) : '';
  if (!database.endsWith('_test')) throw new Error(`Recusado: ${name} precisa apontar para um banco _test.`);
}

// Banco de teste limpo (principal e âncora) e com o seed, a cada execução do E2E.
const pool = createTestPool(2);
await resetDatabase(pool);
await runSeed(pool);
await pool.end();

// Imitador local da API do museu (fixtures reais salvas na etapa 01): o E2E não depende da internet.
const catalog = await startCatalogStub();

process.env.PORT = process.env.E2E_PORT ?? '3300';
process.env.DATABASE_URL = testDatabase;
process.env.ANCHOR_DATABASE_URL = testAnchor;
process.env.CMA_API_BASE_URL = catalog.baseUrl;
process.env.SETTLEMENT_INTERVAL_MS = '1000';

// O mesmo server.ts de produção (o .env não sobrescreve variáveis já definidas).
await import('../apps/api/src/server.js');
