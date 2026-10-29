import { defineConfig } from '@playwright/test';

const port = Number(process.env.E2E_PORT ?? 3300);

/**
 * E2E enxuto: a aplicação real com bancos de teste. Usa o Google Chrome já instalado
 * (channel: 'chrome'), sem baixar navegador. Rode com: npm run test:e2e
 */
export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // O lote precisa terminar de verdade (sem relógio falso): o teste espera alguns minutos.
  timeout: 8 * 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${port}`,
    channel: 'chrome',
    headless: true,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx tsx e2e/server.ts',
    cwd: '..',
    url: `http://localhost:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { E2E_PORT: String(port) },
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
