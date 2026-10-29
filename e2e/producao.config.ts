import { defineConfig } from '@playwright/test';

/**
 * Smoke test contra a URL PÚBLICA (etapa 21). Não sobe servidor nem mexe em banco:
 * usa o site publicado como um avaliador usaria. Cria um lote curto, deposita R$ 100,00 em
 * cada cliente e dá dois lances (dados de demonstração reais, que ficam no histórico).
 *
 * Rode só quando quiser, informando a senha das contas de demonstração na hora:
 *   PowerShell: $env:SMOKE_PASSWORD='...'; npm.cmd run smoke:prod
 *   Bash:       SMOKE_PASSWORD='...' npm run smoke:prod
 */
export default defineConfig({
  testDir: '.',
  testMatch: '*.prod.ts',
  workers: 1,
  retries: 0,
  timeout: 10 * 60_000, // inclui acordar o Render e esperar o lote terminar de verdade
  expect: { timeout: 30_000 },
  reporter: [['list']],
  use: {
    baseURL: process.env.SMOKE_URL ?? 'https://verzel-leiloes-ricardo.onrender.com',
    channel: 'chrome',
    headless: true,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
  },
});
