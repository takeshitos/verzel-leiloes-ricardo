import { Router } from 'express';
import type { Pool } from 'pg';
import { AppError } from '../../shared/errors.js';
import { requireRole } from '../auth/middleware.js';
import { listBidderParticipations } from '../lots/queries.js';
import type { ReceiptPayload } from './service.js';

/** Token do comprovante: 43 caracteres base64url (32 bytes aleatórios). */
const RECEIPT_TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;

export function createSettlementRouter(pool: Pool) {
  const router = Router();

  // Comprovante público: abre sem login, por link. Token desconhecido ou malformado recebe a
  // mesma resposta 404, sem dizer o motivo.
  router.get('/receipts/:token', async (req, res) => {
    const token = req.params.token as string;
    const notFound = new AppError(404, 'NOT_FOUND', 'Comprovante não encontrado.');
    if (!RECEIPT_TOKEN_FORMAT.test(token)) throw notFound;

    const result = await pool.query<{ payload: ReceiptPayload }>('SELECT payload FROM receipts WHERE public_token = $1', [
      token,
    ]);
    if (!result.rows[0]) throw notFound;

    res.set('Cache-Control', 'no-store');
    res.set('X-Robots-Tag', 'noindex'); // link compartilhável, mas não para buscadores
    res.json({ receipt: result.rows[0].payload });
  });

  // Participações e vitórias do licitante logado (dados do próprio usuário).
  router.get('/me/participations', requireRole('bidder'), async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(await listBidderParticipations(pool, req.user!.id));
  });

  return router;
}
