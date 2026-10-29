import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../../shared/errors.js';
import { createRateLimiter } from '../../shared/rate-limit.js';
import { parseBody } from '../../shared/validation.js';
import { requireRole } from '../auth/middleware.js';
import type { CatalogClient, CatalogSource } from './client.js';
import type { ItemSnapshotInput } from './cma.js';

const searchQuerySchema = z.object({
  q: z
    .string({ error: 'Informe o que buscar.' })
    .trim()
    .min(2, 'Digite pelo menos 2 caracteres.')
    .max(100, 'A busca pode ter no máximo 100 caracteres.'),
  page: z.coerce
    .number({ error: 'Página inválida.' })
    .int('Página inválida.')
    .min(1, 'Página inválida.')
    .max(50, 'Página máxima: 50.')
    .default(1),
});

const EXTERNAL_ID_FORMAT = /^\d{1,10}$/;

/** Formato devolvido ao leiloeiro. Os mesmos dados viram o snapshot quando ele cria o lote. */
export function toCatalogItemResponse(item: ItemSnapshotInput) {
  return {
    externalId: item.externalId,
    title: item.title,
    creators: item.creators,
    creationDate: item.creationDate,
    technique: item.technique,
    type: item.itemType,
    culture: item.culture,
    measurements: item.measurements,
    image: item.imageUrl ? { url: item.imageUrl, width: item.imageWidth, height: item.imageHeight } : null,
    sourceUrl: item.sourceUrl,
    license: item.license,
  };
}

function toSourceResponse(source: CatalogSource) {
  return {
    provider: 'Cleveland Museum of Art Open Access API',
    origin: source.origin,
    stale: source.stale,
    fetchedAt: source.fetchedAt.toISOString(),
    ageSeconds: Math.max(0, Math.round((Date.now() - source.fetchedAt.getTime()) / 1000)),
  };
}

export function createCatalogRouter(catalog: CatalogClient) {
  const router = Router();
  // Protege a API do museu: no máximo 30 buscas por minuto por leiloeiro.
  const perUser = createRateLimiter({ windowMs: 60_000, max: 30 });

  router.use('/catalog', requireRole('seller'), (req, res, next) => {
    const result = perUser.hit(req.user!.id);
    if (!result.allowed) {
      res.set('Retry-After', String(result.retryAfterSeconds));
      throw new AppError(429, 'TOO_MANY_REQUESTS', 'Muitas buscas seguidas. Aguarde um pouco.');
    }
    next();
  });

  router.get('/catalog/search', async (req, res) => {
    const { q, page } = parseBody(searchQuerySchema, req.query);
    const result = await catalog.search(q, page);

    res.json({
      items: result.items.map(toCatalogItemResponse),
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      hasMore: result.page * result.pageSize < result.total,
      skipped: result.skipped,
      source: toSourceResponse(result.source),
    });
  });

  router.get('/catalog/items/:externalId', async (req, res) => {
    const { externalId } = req.params;
    if (!EXTERNAL_ID_FORMAT.test(externalId)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Identificador de obra inválido.');
    }

    const result = await catalog.getItem(externalId);
    if (!result) {
      throw new AppError(404, 'CATALOG_ITEM_NOT_FOUND', 'Obra não encontrada no catálogo do museu.');
    }
    res.json({ item: toCatalogItemResponse(result.item), source: toSourceResponse(result.source) });
  });

  return router;
}
