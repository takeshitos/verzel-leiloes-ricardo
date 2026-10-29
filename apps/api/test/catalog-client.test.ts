// Cliente do catálogo contra um servidor local que imita a API da Cleveland.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCatalogClient, type CatalogClient } from '../src/modules/catalog/client.js';
import { fetchItemForLot } from '../src/modules/catalog/snapshots.js';
import { AppError } from '../src/shared/errors.js';
import { fixtureItem152006, fixtureSearch, sendJson, startCatalogStub, type CatalogStub } from './catalog-stub.js';

let stub: CatalogStub;
let clock: number;
let client: CatalogClient;

beforeEach(async () => {
  stub = await startCatalogStub();
  clock = Date.parse('2026-10-29T03:00:00Z');
  client = createCatalogClient({ baseUrl: stub.baseUrl, timeoutMs: 300, now: () => clock });
});

afterEach(async () => {
  await stub.close();
});

async function expectUnavailable(promise: Promise<unknown>, reason: RegExp) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).status).toBe(503);
  expect((error as AppError).code).toBe('CATALOG_UNAVAILABLE');
  expect(String((error as AppError).details?.reason)).toMatch(reason);
  return error as AppError;
}

describe('busca', () => {
  it('normaliza a resposta real e pede só obras CC0 com imagem, 12 por página', async () => {
    const result = await client.search('landscape', 2);

    expect(result.total).toBe(fixtureSearch.info.total);
    expect(result.items.map((item) => item.externalId)).toEqual(['147016', '152006']);
    expect(result.items[0]).toMatchObject({
      title: 'Virgin and Child in a Landscape',
      creators: 'Jan Gossaert (Flemish, c. 1475/78–1532); Anonymous Landscape Painter (Flemish)',
      imageUrl: 'https://openaccess-cdn.clevelandart.org/1972.47/1972.47_web.jpg',
      imageWidth: 778,
      imageHeight: 893,
      sourceUrl: 'https://clevelandart.org/art/1972.47',
      license: 'CC0',
    });
    expect(result.source).toMatchObject({ origin: 'live', stale: false });

    const query = stub.requests[0].searchParams;
    expect(stub.requests[0].pathname).toBe('/api/artworks/');
    expect(query.get('q')).toBe('landscape');
    expect(query.get('cc0')).toBe('1');
    expect(query.get('has_image')).toBe('1');
    expect(query.get('limit')).toBe('12');
    expect(query.get('skip')).toBe('12');
  });

  it('usa o cache por 60 s e consulta de novo depois', async () => {
    await client.search('landscape', 1);
    clock += 30_000;
    const cached = await client.search('LANDSCAPE', 1);
    expect(cached.source).toMatchObject({ origin: 'cache', stale: false });
    expect(stub.requests).toHaveLength(1);

    clock += 31_000;
    await client.search('landscape', 1);
    expect(stub.requests).toHaveLength(2);
  });

  it('429 vira CATALOG_UNAVAILABLE com o tempo de espera informado pelo museu', async () => {
    stub.setHandler((_req, res) => sendJson(res, 429, { detail: 'slow down' }, { 'Retry-After': '30' }));
    const error = await expectUnavailable(client.search('landscape', 1), /429/);
    expect(error.details?.retryAfterSeconds).toBe(30);
  });

  it('erro 5xx vira CATALOG_UNAVAILABLE, sem nova tentativa automática', async () => {
    stub.setHandler((_req, res) => sendJson(res, 502, { detail: 'bad gateway' }));
    await expectUnavailable(client.search('landscape', 1), /HTTP 502/);
    expect(stub.requests).toHaveLength(1);
  });

  it('resposta que não é JSON ou com formato inesperado vira CATALOG_UNAVAILABLE', async () => {
    stub.setHandler((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html>manutenção</html>');
    });
    await expectUnavailable(client.search('landscape', 1), /não é JSON/);

    stub.setHandler((_req, res) => sendJson(res, 200, { resultados: [] }));
    await expectUnavailable(client.search('outra', 1), /formato inesperado/);
  });

  it('timeout curto: sem resposta em 300 ms vira CATALOG_UNAVAILABLE', async () => {
    stub.setHandler((_req, res) => {
      setTimeout(() => sendJson(res, 200, fixtureSearch), 1_500);
    });
    await expectUnavailable(client.search('landscape', 1), /300 ms/);
  });

  it('API fora do ar (conexão recusada) vira CATALOG_UNAVAILABLE', async () => {
    const offline = createCatalogClient({ baseUrl: 'http://127.0.0.1:9/api/', timeoutMs: 500 });
    await expectUnavailable(offline.search('landscape', 1), /falha de conexão|sem resposta/);
  });

  it('com a API falhando, serve o cache vencido por até 10 min, informando idade e origem', async () => {
    const first = await client.search('landscape', 1);
    stub.setHandler((_req, res) => sendJson(res, 500, {}));

    clock += 2 * 60_000;
    const stale = await client.search('landscape', 1);
    expect(stale.items).toEqual(first.items);
    expect(stale.source).toEqual({ origin: 'cache', stale: true, fetchedAt: first.source.fetchedAt });

    clock += 9 * 60_000; // 11 min depois da coleta
    await expectUnavailable(client.search('landscape', 1), /HTTP 500/);
  });

  it('descarta obras inválidas ou não CC0 e anula imagem de host desconhecido ou ausente', async () => {
    const [good] = fixtureSearch.data;
    stub.setHandler((_req, res) =>
      sendJson(res, 200, {
        info: { total: 5 },
        data: [
          good,
          { ...good, id: 1, title: '' }, // sem título: descartada
          { ...good, id: 2, share_license_status: 'Copyrighted' }, // não CC0: descartada
          { ...good, id: 3, images: { web: { url: 'https://site-estranho.example/x.jpg', width: '10', height: '10' } } },
          { ...good, id: 4, images: null },
        ],
      }),
    );

    const result = await client.search('landscape', 1);
    expect(result.skipped).toBe(2);
    expect(result.items.map((item) => [item.externalId, item.imageUrl])).toEqual([
      ['147016', 'https://openaccess-cdn.clevelandart.org/1972.47/1972.47_web.jpg'],
      ['3', null],
      ['4', null],
    ]);
  });
});

describe('detalhe da obra', () => {
  it('devolve a obra real normalizada', async () => {
    const result = await client.getItem('152006');
    expect(result?.item).toMatchObject({
      externalId: '152006',
      title: fixtureItem152006.data.title,
      imageUrl: 'https://openaccess-cdn.clevelandart.org/1984.59/1984.59_web.jpg',
      imageWidth: 1166,
      imageHeight: 893,
    });
    expect(stub.requests[0].pathname).toBe('/api/artworks/152006');
  });

  it('obra inexistente devolve null', async () => {
    expect(await client.getItem('999999999')).toBeNull();
  });

  it('recusa resposta com outra obra ou sem licença CC0', async () => {
    stub.setHandler((_req, res) => sendJson(res, 200, { data: { ...fixtureItem152006.data, id: 1 } }));
    await expectUnavailable(client.getItem('152006'), /obra diferente/);

    stub.setHandler((_req, res) => sendJson(res, 200, { data: { ...fixtureItem152006.data, share_license_status: 'Other' } }));
    await expectUnavailable(client.getItem('152006'), /CC0/);
  });

  it('para criar lote, exige obra existente e com imagem', async () => {
    await expect(fetchItemForLot(client, '999999999')).rejects.toMatchObject({ status: 404, code: 'CATALOG_ITEM_NOT_FOUND' });

    stub.setHandler((_req, res) => sendJson(res, 200, { data: { ...fixtureItem152006.data, images: null } }));
    const fresh = createCatalogClient({ baseUrl: stub.baseUrl, timeoutMs: 300 });
    await expect(fetchItemForLot(fresh, '152006')).rejects.toMatchObject({ status: 422, code: 'CATALOG_ITEM_WITHOUT_IMAGE' });
  });
});
