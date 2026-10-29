import cookieParser from 'cookie-parser';
import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Pool } from 'pg';
import { loadSessionUser } from './modules/auth/middleware.js';
import { createAuthRouter } from './modules/auth/routes.js';
import { createHealthRouter } from './modules/health/routes.js';
import { apiNotFound, errorBody, errorHandler } from './shared/errors.js';
import { requireJsonBody, requireSameOrigin } from './shared/request-guards.js';

export type AppOptions = {
  /** Pasta com o build do React (apps/web/dist). Se não existir, a API não serve o frontend. */
  webDistDir: string;
  /** Pool de conexões do PostgreSQL, criado uma vez no startup. */
  pool: Pool;
  /** Em produção: cookie Secure com prefixo __Host-. */
  isProduction: boolean;
  /** Quantos proxies confiáveis existem na frente da API (Render: 1). 0 = nenhum. */
  trustProxyHops: number;
  /** Cabeçalho com o IP real do cliente, reescrito pelo proxy (Render/Cloudflare: cf-connecting-ip). */
  clientIpHeader?: string;
};

export function createApp({ webDistDir, pool, isProduction, trustProxyHops, clientIpHeader }: AppOptions) {
  const app = express();

  app.disable('x-powered-by');
  if (trustProxyHops > 0) {
    // O Render termina o HTTPS no proxy; isto faz o Express confiar no X-Forwarded-Proto dele.
    app.set('trust proxy', trustProxyHops);
  }
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  // 1. API
  // Proteções de toda requisição que altera estado: mesma origem e corpo em JSON.
  app.use('/api', requireSameOrigin, requireJsonBody);
  app.use('/api', createHealthRouter(pool));
  // A partir daqui, req.user existe se houver sessão válida. Cada rota decide se exige login.
  app.use('/api', loadSessionUser(pool, isProduction));
  app.use('/api', createAuthRouter({ pool, isProduction, clientIpHeader }));
  app.use('/api', apiNotFound);

  // 2. Frontend (produção): arquivos estáticos e qualquer rota da SPA devolvendo index.html.
  const indexHtml = path.join(webDistDir, 'index.html');
  if (existsSync(indexHtml)) {
    app.use(express.static(webDistDir, { index: false }));

    app.use((req, res, next) => {
      const isPageRequest = req.method === 'GET' || req.method === 'HEAD';
      // Caminho com extensão (ex.: /assets/x.js) que não existe é 404, não a SPA.
      if (!isPageRequest || path.extname(req.path) !== '') {
        next();
        return;
      }
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(indexHtml);
    });
  }

  // 3. Qualquer outra coisa
  app.use((_req, res) => {
    res.status(404).json(errorBody('NOT_FOUND', 'Recurso não encontrado.'));
  });

  app.use(errorHandler);

  return app;
}
