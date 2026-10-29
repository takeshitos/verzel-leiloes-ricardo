import { Router } from 'express';
import { AppError } from '../../shared/errors.js';
import { UUID_FORMAT } from '../lots/public-routes.js';
import type { AuditService } from './service.js';

/** Rotas públicas (sem login) da auditoria. */
export function createAuditRouter(audit: AuditService) {
  const router = Router();

  // Histórico completo do lote + estado: ÍNTEGRO, ADULTERADO, VERIFICAÇÃO PENDENTE ou INDISPONÍVEL.
  router.get('/lots/:id/audit', async (req, res) => {
    const { id } = req.params;
    if (!UUID_FORMAT.test(id)) throw new AppError(404, 'NOT_FOUND', 'Lote não encontrado.');
    const report = await audit.verifyLot(id);
    if (!report) throw new AppError(404, 'NOT_FOUND', 'Lote não encontrado.');

    res.set('Cache-Control', 'no-store'); // a verificação é sempre feita na hora
    res.json({ audit: report });
  });

  // Chave(s) pública(s) para quem quiser conferir as assinaturas por conta própria.
  router.get('/audit/public-key', (_req, res) => {
    res.json({ algorithm: 'Ed25519', format: 'verzel-audit-v1|lotId|bidCount|lastHash|keyVersion', keys: audit.keyring.publicKeys() });
  });

  return router;
}
