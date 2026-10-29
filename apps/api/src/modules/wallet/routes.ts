import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { AppError } from '../../shared/errors.js';
import { requireIdempotencyKey } from '../../shared/idempotency.js';
import { centsSchema, MAX_DEPOSIT_CENTS } from '../../shared/money.js';
import { createRateLimiter } from '../../shared/rate-limit.js';
import { parseBody } from '../../shared/validation.js';
import { requireRole } from '../auth/middleware.js';
import { deposit, getWallet } from './service.js';

// strictObject: não existe campo para escolher de quem é a carteira; ela é sempre a da sessão.
const depositSchema = z.strictObject({
  amountCents: centsSchema('O valor do depósito', MAX_DEPOSIT_CENTS),
});

/**
 * Carteira do licitante. O leiloeiro não deposita: recebe pela liquidação e vê o total
 * recebido no painel (GET /api/seller/summary).
 */
export function createWalletRouter(pool: Pool) {
  const router = Router();
  const depositsPerUser = createRateLimiter({ windowMs: 60_000, max: 20 });

  router.get('/wallet', requireRole('bidder'), async (req, res) => {
    res.json({ wallet: await getWallet(pool, req.user!.id) });
  });

  router.post('/wallet/deposits', requireRole('bidder'), async (req, res) => {
    const limit = depositsPerUser.hit(req.user!.id);
    if (!limit.allowed) {
      res.set('Retry-After', String(limit.retryAfterSeconds));
      throw new AppError(429, 'TOO_MANY_REQUESTS', 'Muitos depósitos seguidos. Aguarde um pouco.');
    }

    const key = requireIdempotencyKey(req.get('idempotency-key'));
    const { amountCents } = parseBody(depositSchema, req.body);

    const result = await deposit(pool, req.user!.id, amountCents, key);
    if (result.replayed) res.set('Idempotent-Replayed', 'true');
    res.status(result.status).json(result.body);
  });

  return router;
}
