// Chamada REAL à API da Cleveland (precisa de internet). Não roda no npm test;
// use npm run test:live -w apps/api. Serve para validar que a integração de produção funciona.
import { describe, expect, it } from 'vitest';
import { createCatalogClient } from '../src/modules/catalog/client.js';
import { fetchItemForLot } from '../src/modules/catalog/snapshots.js';

const catalog = createCatalogClient({ baseUrl: 'https://openaccess-api.clevelandart.org/api/', timeoutMs: 10_000 });

describe('Cleveland Museum of Art Open Access API (real)', () => {
  it('busca obras CC0 com imagem no CDN oficial', async () => {
    const result = await catalog.search('landscape', 1);

    expect(result.source.origin).toBe('live');
    expect(result.total).toBeGreaterThan(0);
    expect(result.items.length).toBeGreaterThan(0);
    for (const item of result.items) {
      expect(item.license).toBe('CC0');
      expect(item.title.length).toBeGreaterThan(0);
      if (item.imageUrl) expect(new URL(item.imageUrl).hostname).toBe('openaccess-cdn.clevelandart.org');
    }
    console.log(`busca real: total=${result.total}, recebidas=${result.items.length}, descartadas=${result.skipped}`);
  });

  it('consulta a obra 152006 e a aceita para criar lote', async () => {
    const item = await fetchItemForLot(catalog, '152006');
    expect(item.title).toBe('Rocky, Wooded Landscape with a Dell and Weir');
    expect(item.imageUrl).toMatch(/^https:\/\/openaccess-cdn\.clevelandart\.org\//);
    console.log(`item real: ${item.title} | ${item.creators} | ${item.imageUrl}`);
  });

  it('a imagem do CDN responde para o servidor', async () => {
    const item = await fetchItemForLot(catalog, '152006');
    // O CDN não responde a HEAD (verificado em 28/10/2026: curl -I fica sem resposta);
    // por isso pedimos só o primeiro 1 KB com GET + Range.
    const image = await fetch(item.imageUrl!, { headers: { Range: 'bytes=0-1023' }, signal: AbortSignal.timeout(10_000) });
    expect([200, 206]).toContain(image.status);
    expect(image.headers.get('content-type')).toMatch(/^image\//);
    await image.arrayBuffer();
  });
});
