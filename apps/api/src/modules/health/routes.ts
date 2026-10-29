import { Router } from 'express';
import type { Pool } from 'pg';

const DATABASE_CHECK_TIMEOUT_MS = 3_000;

async function databaseIsReachable(pool: Pool): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), DATABASE_CHECK_TIMEOUT_MS);
  });

  try {
    const check = pool.query('SELECT 1').then(
      () => true,
      () => false,
    );
    return await Promise.race([check, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export function createHealthRouter(pool: Pool) {
  const router = Router();

  // Usado pelo Render para saber se a instância está pronta. Sem banco, a API não funciona.
  router.get('/health', async (_req, res) => {
    const databaseOk = await databaseIsReachable(pool);

    res.status(databaseOk ? 200 : 503).json({
      status: databaseOk ? 'ok' : 'degraded',
      database: databaseOk ? 'ok' : 'unavailable',
      serverTime: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    });
  });

  return router;
}
