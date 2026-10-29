import type { RequestHandler } from 'express';
import type { Pool } from 'pg';
import { AppError } from '../../shared/errors.js';

const UUID_FORMAT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Exige que o usuário logado seja o dono do lote em req.params.id.
 * Use depois de requireRole('seller'). O dono de um lote nunca muda, então esta conferência
 * fora da transação é segura; as operações que alteram o lote ainda o bloqueiam (FOR UPDATE).
 */
export function requireLotOwner(pool: Pool): RequestHandler {
  return async (req, _res, next) => {
    if (!req.user) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Faça login para continuar.');
    }

    const lotId = req.params.id;
    if (typeof lotId !== 'string' || !UUID_FORMAT.test(lotId)) {
      throw new AppError(404, 'NOT_FOUND', 'Lote não encontrado.');
    }

    const result = await pool.query<{ seller_id: string }>('SELECT seller_id FROM lots WHERE id = $1', [lotId]);
    const lot = result.rows[0];
    if (!lot) {
      throw new AppError(404, 'NOT_FOUND', 'Lote não encontrado.');
    }
    if (lot.seller_id !== req.user.id) {
      throw new AppError(403, 'FORBIDDEN', 'Você só pode gerenciar os seus próprios lotes.');
    }
    next();
  };
}
