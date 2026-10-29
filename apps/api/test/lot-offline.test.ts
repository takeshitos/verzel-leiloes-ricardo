// Prova de R15 nesta etapa: um lote já salvo continua consultável com a API do museu
// fora do ar, inclusive depois de reiniciar o processo do servidor.
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveDatabaseUrl } from '../src/db/database-url.js';
import { runSeed } from '../src/db/seed-data.js';
import { createCatalogClient } from '../src/modules/catalog/client.js';
import { fetchItemForLot, upsertSnapshot } from '../src/modules/catalog/snapshots.js';
import { startCatalogStub, type CatalogStub } from './catalog-stub.js';
import { createTestApp, createTestPool, resetDatabase, sessionCookie } from './helpers.js';

const pool = createTestPool();
let stub: CatalogStub;
let lotId: string;
const catalogOfflineUrl = 'http://127.0.0.1:9/api/'; // porta onde nada responde

beforeAll(async () => {
  await resetDatabase(pool);
  await runSeed(pool);

  // 1. Com o museu no ar (servidor local com respostas reais), o servidor busca a obra
  //    pelo id e grava o snapshot. Nenhum dado da obra vem do cliente.
  stub = await startCatalogStub();
  const catalog = createCatalogClient({ baseUrl: stub.baseUrl, timeoutMs: 500 });
  const item = await fetchItemForLot(catalog, '152006');
  const snapshotId = await upsertSnapshot(pool, item);

  const seller = await pool.query<{ id: string }>("SELECT id FROM users WHERE email = 'leiloeiro@example.com'");
  const lot = await pool.query<{ id: string }>(
    `INSERT INTO lots (seller_id, snapshot_id, starting_bid_cents, min_increment_cents, starts_at, original_ends_at, ends_at)
     VALUES ($1, $2, 25000, 2500, now() - interval '1 minute', now() + interval '1 day', now() + interval '1 day')
     RETURNING id`,
    [seller.rows[0].id, snapshotId],
  );
  lotId = lot.rows[0].id;

  // 2. O museu sai do ar.
  await stub.close();
});

afterAll(async () => {
  await pool.end();
});

function expectLotFromSnapshot(body: { lot: Record<string, unknown> }) {
  expect(body.lot).toMatchObject({
    id: lotId,
    status: 'live',
    startingBidCents: 25000,
    nextMinimumBidCents: 25000,
    bidCount: 0,
    sellerAlias: expect.stringMatching(/^VEN-/),
    item: {
      title: 'Rocky, Wooded Landscape with a Dell and Weir',
      creators: 'Thomas Gainsborough (British, 1727–1788)',
      image: { url: 'https://openaccess-cdn.clevelandart.org/1984.59/1984.59_web.jpg', width: 1166, height: 893 },
    },
    source: { provider: 'Cleveland Museum of Art', externalId: '152006', url: 'https://clevelandart.org/art/1984.59', license: 'CC0' },
  });
  // Dados privados nunca aparecem no detalhe público.
  expect(JSON.stringify(body)).not.toMatch(/example\.com|seller_id|password|raw/);
}

describe('API do museu fora do ar', () => {
  it('o detalhe público do lote vem só do banco local', async () => {
    const app = createTestApp(pool, { catalog: createCatalogClient({ baseUrl: stub.baseUrl, timeoutMs: 500 }) });
    const response = await request(app).get(`/api/lots/${lotId}`);

    expect(response.status).toBe(200);
    expectLotFromSnapshot(response.body);
  });

  it('a busca do leiloeiro informa indisponibilidade em vez de inventar resultados', async () => {
    const app = createTestApp(pool, { catalog: createCatalogClient({ baseUrl: catalogOfflineUrl, timeoutMs: 500 }) });
    const login = await request(app).post('/api/auth/login').send({ email: 'leiloeiro@example.com', password: 'leilao-demo-2026' });
    const response = await request(app).get('/api/catalog/search?q=landscape').set('Cookie', sessionCookie(login));

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('CATALOG_UNAVAILABLE');
  });
});

// Sobe o servidor de verdade (src/server.ts) num processo separado, com o catálogo apontando
// para uma porta morta. Repetir simula o reinício: nada fica em memória entre um e outro.
async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });
}

async function startServerProcess(port: number): Promise<ChildProcess> {
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
    cwd: process.cwd(), // apps/api
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      HOST: '127.0.0.1',
      DATABASE_URL: resolveDatabaseUrl({ test: true }),
      CMA_API_BASE_URL: catalogOfflineUrl,
      CATALOG_TIMEOUT_MS: '500',
      RUN_MIGRATIONS_ON_START: 'false',
      RUN_SEED_ON_START: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  await new Promise<void>((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`Servidor não subiu a tempo:\n${output}`)), 30_000);
    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      if (output.includes('API ouvindo')) {
        clearTimeout(timer);
        resolve();
      }
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Servidor saiu com código ${code}:\n${output}`));
    });
  });
  return child;
}

async function stopServerProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    child.once('exit', () => resolve());
    child.kill();
  });
}

describe('reinício do processo com o museu fora do ar', () => {
  it('o lote continua consultável em dois processos novos seguidos', async () => {
    for (const round of [1, 2]) {
      const port = await freePort();
      const server = await startServerProcess(port);
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/lots/${lotId}`);
        expect(response.status, `processo ${round}`).toBe(200);
        expectLotFromSnapshot((await response.json()) as { lot: Record<string, unknown> });
      } finally {
        await stopServerProcess(server);
      }
    }
  });
});
