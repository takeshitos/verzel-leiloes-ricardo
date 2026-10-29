// Fluxo completo pela interface, com sessões separadas (um contexto do navegador por pessoa):
// leiloeiro cria o lote, dois licitantes depositam e disputam, a carteira e o indicador mudam
// sem recarregar, o lote termina de verdade e um visitante abre a auditoria e o comprovante.
import { expect, test, type Browser, type Page } from '@playwright/test';

const PASSWORD = 'senha-e2e-2026';
const run = Date.now().toString(36);
const TIMEZONE = 'America/Sao_Paulo'; // o mesmo do navegador (playwright.config.ts)

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

/** Cadastro real pela tela (conta só do banco de teste). */
async function register(browser: Browser, role: 'Licitante' | 'Leiloeiro', name: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/entrar?modo=cadastro');
  await page.getByLabel('Email').fill(`e2e-${name}-${run}@example.test`);
  await page.getByLabel('Senha').fill(PASSWORD);
  await page.getByRole('radio', { name: new RegExp(role) }).check();
  await page.locator('form').getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible();
  return page;
}

async function deposit(page: Page, amount: string) {
  await page.goto('/carteira');
  await page.getByLabel('Valor (R$)').fill(amount);
  await page.getByRole('button', { name: 'Depositar' }).click();
  await expect(page.getByText(/Depósito simulado de R\$\s1\.000,00 registrado\./)).toBeVisible();
}

async function bid(page: Page, amount: string) {
  await page.getByLabel('Seu lance (R$)').fill(amount);
  await page.getByRole('button', { name: 'Dar lance' }).click();
  await expect(page.getByText(/aceito às/)).toBeVisible();
}

const standing = (page: Page) => page.locator('.my-standing .badge');

test('leiloeiro cria, dois licitantes disputam, o lote fecha e o visitante confere', async ({ browser }) => {
  // 1. Leiloeiro cria o lote pela tela (busca no imitador local da API do museu).
  const seller = await register(browser, 'Leiloeiro', 'vendedor');
  await expect(seller).toHaveURL(/\/painel$/);
  await seller.getByLabel('Buscar obra no acervo do Cleveland Museum of Art').fill('landscape');
  await seller.getByRole('button', { name: 'Buscar', exact: true }).click();
  await seller.locator('.catalog-item', { hasText: 'Rocky, Wooded Landscape' }).getByRole('button', { name: 'Escolher esta obra' }).click();
  await seller.getByLabel('Lance inicial (R$)').fill('100,00');
  await seller.getByLabel('Incremento mínimo (R$)').fill('10');
  // Fim em ~3 minutos: os lances abaixo chegam com mais de 2 min restantes (sem prorrogação).
  await seller.getByLabel('Data e hora de fim').fill(localInput(4));
  await seller.getByRole('button', { name: 'Criar lote' }).click();
  const created = seller.locator('.notice-success', { hasText: 'Lote criado' });
  await expect(created).toBeVisible();
  const lotPath = await created.getByRole('link').first().getAttribute('href');
  expect(lotPath).toMatch(/^\/lotes\/[0-9a-f-]{36}$/);

  // 2. Dois licitantes, cada um na própria sessão, depositam R$ 1.000,00.
  const a = await register(browser, 'Licitante', 'a');
  const b = await register(browser, 'Licitante', 'b');
  await deposit(a, '1.000,00');
  await deposit(b, '1000');

  // 3. Disputa: A lidera; B vê sem recarregar; B cobre; A é superado e a reserva volta na hora.
  await a.goto(lotPath!);
  await b.goto(lotPath!);
  await bid(a, '100,00');
  await expect(standing(a)).toHaveText('Você está ganhando');
  await expect(a.locator('.my-wallet')).toContainText(/Reservado: R\$\s100,00/);
  await expect(b.locator('.figures')).toContainText(/R\$\s100,00/);

  await bid(b, '120,00');
  await expect(standing(b)).toHaveText('Você está ganhando');
  await expect(standing(a)).toHaveText('Você foi superado');
  await expect(a.locator('.my-wallet')).toContainText(/Disponível: R\$\s1\.000,00 · Reservado: R\$\s0,00/);

  // 4. O lote termina de verdade e o servidor liquida sozinho (job a cada 1 s no E2E).
  await expect(standing(b)).toHaveText('Você arrematou este lote', { timeout: 5 * 60_000 });
  await expect(standing(a)).toHaveText('Você não venceu este lote');
  await expect(b.locator('.my-wallet')).toContainText(/Disponível: R\$\s880,00 · Reservado: R\$\s0,00/);

  // 5. Leiloeiro vê o resultado e o total recebido.
  await seller.goto('/painel');
  await expect(seller.locator('.stat', { hasText: 'Total recebido' })).toContainText(/R\$\s120,00/);
  await expect(seller.getByText(/Arrematado por LIC-[0-9A-F]{6} por R\$\s120,00/)).toBeVisible();

  // 6. Visitante (sem login) abre o comprovante pelo link e a auditoria.
  const receiptLink = b.getByRole('link', { name: 'Ver o comprovante do arremate' });
  await expect(receiptLink).toBeVisible();
  const receiptPath = await receiptLink.getAttribute('href');
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(receiptPath!);
  await expect(visitor.locator('.receipt-amount')).toHaveText(/R\$\s120,00/);
  await expect(visitor.getByText(/^LIQ-[0-9A-F]{10}$/)).toBeVisible();
  await expect(visitor.getByRole('link', { name: 'Entrar' })).toBeVisible(); // continua visitante
  await visitor.reload();
  await expect(visitor.locator('.receipt-amount')).toHaveText(/R\$\s120,00/);

  await visitor.goto(`${lotPath}/auditoria`);
  await expect(visitor.locator('.audit-label')).toHaveText('ÍNTEGRO');
  await expect(visitor.getByRole('heading', { name: 'Histórico completo (2)' })).toBeVisible();
  // Nada de email na página pública (nem escondido no HTML).
  expect(await visitor.content()).not.toContain('@example.test');
});
