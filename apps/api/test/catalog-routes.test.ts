// Rotas do catálogo: só leiloeiro, validação, 503 quando o museu falha.
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runSeed } from '../src/db/seed-data.js';
import { createCatalogClient } from '../src/modules/catalog/client.js';
import { sendJson, startCatalogStub, type CatalogStub } from './catalog-stub.js';
import { createTestApp, createTestPool, resetDatabase, sessionCookie } from './helpers.js';

const pool = createTestPool();
let stub: CatalogStub;
let app: ReturnType<typeof createTestApp>;

beforeEach(async () => {
  await resetDatabase(pool);
  await runSeed(pool);
  stub = await startCatalogStub();
  app = createTestApp(pool, { catalog: createCatalogClient({ baseUrl: stub.baseUrl, timeoutMs: 500 }) });
});

afterEach(async () => {
  await stub.close();
});

afterAll(async () => {
  await pool.end();
});

async function login(email: string) {
  const response = await request(app).post('/api/auth/login').send({ email, password: 'leilao-demo-2026' });
  return sessionCookie(response);
}

describe('GET /api/catalog/search', () => {
  it('visitante recebe 401 e licitante 403', async () => {
    expect((await request(app).get('/api/catalog/search?q=landscape')).status).toBe(401);
    const bidder = await login('cliente1@example.com');
    expect((await request(app).get('/api/catalog/search?q=landscape').set('Cookie', bidder)).status).toBe(403);
    expect(stub.requests).toHaveLength(0); // nenhum acesso ao museu sem permissão
  });

  it('leiloeiro recebe a busca normalizada, com origem e paginação', async () => {
    const seller = await login('leiloeiro@example.com');
    const response = await request(app).get('/api/catalog/search?q=landscape&page=1').set('Cookie', seller);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ page: 1, pageSize: 12, total: 1590, hasMore: true, skipped: 0 });
    expect(response.body.source).toMatchObject({ provider: 'Cleveland Museum of Art Open Access API', origin: 'live', stale: false });
    expect(response.body.items[1]).toEqual({
      externalId: '152006',
      title: 'Rocky, Wooded Landscape with a Dell and Weir',
      creators: 'Thomas Gainsborough (British, 1727–1788)',
      creationDate: 'c. 1782–1783',
      technique: 'oil on canvas',
      type: 'Painting',
      culture: 'England, 18th century',
      measurements: expect.any(String),
      image: { url: 'https://openaccess-cdn.clevelandart.org/1984.59/1984.59_web.jpg', width: 1166, height: 893 },
      sourceUrl: 'https://clevelandart.org/art/1984.59',
      license: 'CC0',
    });
    expect(JSON.stringify(response.body)).not.toContain('"raw"');
  });

  it('valida termo e página', async () => {
    const seller = await login('leiloeiro@example.com');
    const short = await request(app).get('/api/catalog/search?q=a').set('Cookie', seller);
    expect(short.status).toBe(400);
    expect(short.body.error.details.fields.q).toBe('Digite pelo menos 2 caracteres.');

    const badPage = await request(app).get('/api/catalog/search?q=landscape&page=0').set('Cookie', seller);
    expect(badPage.status).toBe(400);
    expect(stub.requests).toHaveLength(0);
  });

  it('ignora qualquer URL enviada pelo cliente: só consulta o endereço configurado', async () => {
    const seller = await login('leiloeiro@example.com');
    await request(app)
      .get('/api/catalog/search?q=landscape&url=https://site-malicioso.example/&baseUrl=http://169.254.169.254/')
      .set('Cookie', seller);
    expect(stub.requests).toHaveLength(1);
    expect(stub.requests[0].pathname).toBe('/api/artworks/');
    expect(stub.requests[0].searchParams.has('url')).toBe(false);
  });

  it('museu com erro: 503 CATALOG_UNAVAILABLE com mensagem legível, sem detalhes internos', async () => {
    stub.setHandler((_req, res) => sendJson(res, 500, { trace: 'segredo do museu' }));
    const seller = await login('leiloeiro@example.com');
    const response = await request(app).get('/api/catalog/search?q=landscape').set('Cookie', seller);

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('CATALOG_UNAVAILABLE');
    expect(response.body.error.message).toBe('O catálogo do museu está indisponível agora. Tente novamente em instantes.');
    expect(JSON.stringify(response.body)).not.toContain('segredo do museu');
  });
});

describe('GET /api/catalog/items/:externalId', () => {
  it('devolve a obra, 404 se não existir e 400 para id inválido', async () => {
    const seller = await login('leiloeiro@example.com');

    const found = await request(app).get('/api/catalog/items/152006').set('Cookie', seller);
    expect(found.status).toBe(200);
    expect(found.body.item.title).toBe('Rocky, Wooded Landscape with a Dell and Weir');

    const missing = await request(app).get('/api/catalog/items/123').set('Cookie', seller);
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('CATALOG_ITEM_NOT_FOUND');

    const invalid = await request(app).get('/api/catalog/items/..%2F..%2Fadmin').set('Cookie', seller);
    expect(invalid.status).toBe(400);
  });
});
