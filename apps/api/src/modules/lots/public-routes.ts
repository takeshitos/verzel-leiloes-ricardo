import { Router } from 'express';
import type { Pool } from 'pg';
import { AppError } from '../../shared/errors.js';
import { findPublicLot, listShowcase } from './queries.js';

export const UUID_FORMAT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Rotas públicas de lotes (sem login). Leem SÓ o banco local (lote + snapshot): funcionam
 * com a API do museu fora do ar. O status é calculado pelo relógio do PostgreSQL.
 */
export function createPublicLotsRouter(pool: Pool) {
  const router = Router();

  // Vitrine: ao vivo, agendados e encerrados. Cancelados não aparecem.
  router.get('/lots', async (_req, res) => {
    const showcase = await listShowcase(pool);
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
