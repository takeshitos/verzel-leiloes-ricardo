// Smoke test pela URL pública com as contas de demonstração do seed (etapa 21).
// Leiloeiro, cliente1 e cliente2 em contextos separados do navegador e um visitante sem login.
import { expect, test, type Browser, type Page } from '@playwright/test';

const PASSWORD = process.env.SMOKE_PASSWORD;
const TIMEZONE = 'America/Sao_Paulo';

/** Valor para <input type="datetime-local"> no fuso do navegador, `minutes` a partir de agora. */
function localInput(minutesFromNow: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(Date.now() + minutesFromNow * 60_000));
  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

async function login(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/entrar');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Senha').fill(PASSWORD!);
  await page.locator('form').getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible();
  return page;
}

async function bid(page: Page, amount: string) {
  await page.getByLabel('Seu lance (R$)').fill(amount);
  await page.getByRole('button', { name: 'Dar lance' }).click();
  await expect(page.getByText(/aceito às/)).toBeVisible();
}

const standing = (page: Page) => page.locator('.my-standing .badge');

test('produção: login dos três, busca real, lote, depósito, disputa, encerramento, comprovante e auditoria', async ({ browser, request }) => {
  test.skip(!PASSWORD, 'Informe SMOKE_PASSWORD (senha das contas de demonstração) para rodar.');

  // Acorda o serviço (o plano gratuito dorme sem tráfego) e confere o básico.
  await expect.poll(async () => (await request.get('/api/health')).status(), { timeout: 120_000 }).toBe(200);
  const missing = await request.get('/api/nao-existe');
  expect(missing.status()).toBe(404);
  expect(missing.headers()['content-type']).toContain('application/json');

  // 1. Leiloeiro: busca real no museu e cria um lote curto.
  const seller = await login(browser, 'leiloeiro@example.com');
  await seller.goto('/painel');
  await seller.getByLabel('Buscar obra no acervo do Cleveland Museum of Art').fill('harbor');
  await seller.getByRole('button', { name: 'Buscar', exact: true }).click();
  await expect(seller.getByText(/obras? encontradas? para "harbor"/)).toBeVisible();
  await seller.getByRole('button', { name: 'Escolher esta obra' }).first().click();
  await seller.getByLabel('Lance inicial (R$)').fill('100,00');
  await seller.getByLabel('Incremento mínimo (R$)').fill('10');
  await seller.getByLabel('Data e hora de fim').fill(localInput(5));
  await seller.getByRole('button', { name: 'Criar lote' }).click();
  const created = seller.locator('.notice-success', { hasText: 'Lote criado' });
  await expect(created).toBeVisible();
  const lotPath = (await created.getByRole('link').first().getAttribute('href'))!;
  expect(lotPath).toMatch(/^\/lotes\/[0-9a-f-]{36}$/);

  // 2. Clientes em sessões separadas: depósito simulado de R$ 100,00 cada.
  const a = await login(browser, 'cliente1@example.com');
  const b = await login(browser, 'cliente2@example.com');
  for (const page of [a, b]) {
    await page.goto('/carteira');
    await page.getByLabel('Valor (R$)').fill('100,00');
    await page.getByRole('button', { name: 'Depositar' }).click();
    await expect(page.getByText(/Depósito simulado de R\$\s100,00 registrado\./)).toBeVisible();
  }

  // 3. Disputa ao vivo: A lidera, B vê sem recarregar e cobre, A é superado.
  await a.goto(lotPath);
  await b.goto(lotPath);
  await bid(a, '100,00');
  await expect(standing(a)).toHaveText('Você está ganhando');
  await expect(b.locator('.figures')).toContainText(/R\$\s100,00/);
  await bid(b, '110,00');
  await expect(standing(b)).toHaveText('Você está ganhando');
  await expect(standing(a)).toHaveText('Você foi superado');

  // 4. Encerramento automático no servidor (o lote termina de verdade).
  await expect(standing(b)).toHaveText('Você arrematou este lote', { timeout: 8 * 60_000 });
  await expect(standing(a)).toHaveText('Você não venceu este lote');

  // 5. Resumo do leiloeiro.
  await seller.goto('/painel');
  await expect(seller.getByText(/Arrematado por LIC-[0-9A-F]{6} por R\$\s110,00/).first()).toBeVisible();

  // 6. Visitante sem login: comprovante e auditoria, com refresh na rota profunda.
  const receiptPath = (await b.getByRole('link', { name: 'Ver o comprovante do arremate' }).getAttribute('href'))!;
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(receiptPath);
  await expect(visitor.locator('.receipt-amount')).toHaveText(/R\$\s110,00/);
  await visitor.reload();
  await expect(visitor.locator('.receipt-amount')).toHaveText(/R\$\s110,00/);
  await visitor.goto(`${lotPath}/auditoria`);
  await expect(visitor.locator('.audit-label')).toHaveText('ÍNTEGRO');
  await expect(visitor.getByRole('heading', { name: 'Histórico completo (2)' })).toBeVisible();
  expect(await visitor.content()).not.toContain('@example.com');

  console.log(`[smoke] lote ${lotPath}, comprovante ${receiptPath}`);
});
