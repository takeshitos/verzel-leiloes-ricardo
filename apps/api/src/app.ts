import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { healthRouter } from './modules/health/routes.js';
import { apiNotFound, errorBody, errorHandler } from './shared/errors.js';

type AppOptions = {
  /** Pasta com o build do React (apps/web/dist). Se não existir, a API não serve o frontend. */
  webDistDir: string;
};

export function createApp({ webDistDir }: AppOptions) {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  // 1. API
  app.use('/api', healthRouter);
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
