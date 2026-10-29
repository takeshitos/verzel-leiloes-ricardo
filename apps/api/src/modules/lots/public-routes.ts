import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { AppError } from '../../shared/errors.js';
import { parseBody } from '../../shared/validation.js';
import { findPublicLot, listShowcase } from './queries.js';

const showcaseQuerySchema = z.object({
  q: z.string().trim().max(100, 'O filtro pode ter no máximo 100 caracteres.').optional(),
  status: z.enum(['live', 'scheduled', 'ended'], { error: 'Estado inválido: use live, scheduled ou ended.' }).optional(),
});

export const UUID_FORMAT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Rotas públicas de lotes (sem login). Leem SÓ o banco local (lote + snapshot): funcionam
 * com a API do museu fora do ar. O status é calculado pelo relógio do PostgreSQL.
 */
export function createPublicLotsRouter(pool: Pool) {
  const router = Router();

  // Vitrine: ao vivo, agendados e encerrados. Cancelados não aparecem.
  // Filtros opcionais (extra): ?q= no título ou autoria e ?status=live|scheduled|ended.
  router.get('/lots', async (req, res) => {
    const { q, status } = parseBody(showcaseQuerySchema, req.query);
    const showcase = await listShowcase(pool, { text: q || undefined, status });
    res.json({ ...showcase, serverTime: new Date().toISOString() });
  });

  router.get('/lots/:id', async (req, res) => {
    const { id } = req.params;
    if (!UUID_FORMAT.test(id)) throw new AppError(404, 'NOT_FOUND', 'Lote não encontrado.');

    const lot = await findPublicLot(pool, id);
    if (!lot) throw new AppError(404, 'NOT_FOUND', 'Lote não encontrado.');
    res.json({ lot, serverTime: new Date().toISOString() });
  });

  return router;
}
