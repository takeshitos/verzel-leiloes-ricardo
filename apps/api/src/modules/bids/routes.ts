import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { AppError } from '../../shared/errors.js';
import { requireIdempotencyKey } from '../../shared/idempotency.js';
import { centsSchema, MAX_WALLET_TOTAL_CENTS } from '../../shared/money.js';
import { createRateLimiter } from '../../shared/rate-limit.js';
import { parseBody } from '../../shared/validation.js';
import { requireRole } from '../auth/middleware.js';
import { UUID_FORMAT } from '../lots/public-routes.js';
import { placeBid, type PlaceBidOptions } from './service.js';

// O cliente manda só o valor. Quem dá o lance, horário, sequência e hashes vêm do servidor.
const bidSchema = z.strictObject({
  amountCents: centsSchema('O valor do lance', MAX_WALLET_TOTAL_CENTS),
});

export function createBidsRouter(pool: Pool, options: PlaceBidOptions = {}) {
  const router = Router();
  const bidsPerUser = createRateLimiter({ windowMs: 60_000, max: 60 });

  // Histórico público do lote: pseudônimos, valores e horários. Sem ids de usuário.
  router.get('/lots/:id/bids', async (req, res) => {
    const { id } = req.params;
    if (!UUID_FORMAT.test(id)) throw new AppError(404, 'NOT_FOUND', 'Lote não encontrado.');
    const exists = await pool.query('SELECT 1 FROM lots WHERE id = $1', [id]);
    if (!exists.rowCount) throw new AppError(404, 'NOT_FOUND', 'Lote não encontrado.');

    const bids = await pool.query<{ seq: number; public_alias: string; amount_cents: number; accepted_at: Date }>(
      'SELECT seq, public_alias, amount_cents, accepted_at FROM bids WHERE lot_id = $1 ORDER BY seq DESC',
      [id],
    );
    res.json({
      bids: bids.rows.map((bid) => ({
        seq: bid.seq,
        alias: bid.public_alias,
        amountCents: bid.amount_cents,
        acceptedAt: bid.accepted_at.toISOString(),
      })),
    });
  });

  // Leiloeiro nunca oferta: requireRole('bidder').
  router.post('/lots/:id/bids', requireRole('bidder'), async (req, res) => {
    const limit = bidsPerUser.hit(req.user!.id);
    if (!limit.allowed) {
      res.set('Retry-After', String(limit.retryAfterSeconds));
      throw new AppError(429, 'TOO_MANY_REQUESTS', 'Muitos lances seguidos. Aguarde um pouco.');
    }

    const id = req.params.id as string;
    if (!UUID_FORMAT.test(id)) throw new AppError(404, 'NOT_FOUND', 'Lote não encontrado.');
    const key = requireIdempotencyKey(req.get('idempotency-key'));
    const { amountCents } = parseBody(bidSchema, req.body);

    const result = await placeBid(pool, { lotId: id, bidderId: req.user!.id, amountCents, idempotencyKey: key }, options);
    if (result.replayed) res.set('Idempotent-Replayed', 'true');
    res.status(result.status).json(result.body);
  });

  return router;
}
