import { Router } from 'express';

export const healthRouter = Router();

// Verificação simples de que a API está no ar. O teste do banco entra na etapa 04.
healthRouter.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    serverTime: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
  });
});
