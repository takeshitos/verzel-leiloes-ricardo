// Falhas que costumam escapar do caminho feliz (etapa 18), no navegador real e nos bancos _test.
// O Playwright só interfere na REDE do navegador (cortar uma resposta, derrubar o Socket.IO,
// bloquear imagens). O servidor, o banco e as regras são os de verdade.
import { randomUUID } from 'node:crypto';
import { expect, test, type Browser, type BrowserContext } from '@playwright/test';

const PASSWORD = 'senha-e2e-2026';
const run = Date.now().toString(36);

/** Licitante novo com R$ 1.000,00, criado pela API dentro do contexto (o cookie fica no contexto). */
async function bidderContext(browser: Browser, name: string): Promise<BrowserContext> {
  const context = await browser.newContext();
  const registered = await context.request.post('/api/auth/register', {
    data: { email: `e2e-${name}-${run}@example.test`, password: PASSWORD, role: 'bidder' },
  });
  expect(registered.status()).toBe(201);
  const deposit = await context.request.post('/api/wallet/deposits', {
    data: { amountCents: 100_000 },
    headers: { 'Idempotency-Key': randomUUID() },
  });
  expect(deposit.status()).toBe(201);
  return context;
}

async function seedLotId(context: BrowserContext): Promise<string> {
  const showcase = await (await context.request.get('/api/lots')).json();
  return showcase.live[0].id as string;
}

test.describe.configure({ mode: 'serial' });

test('resposta perdida DEPOIS do commit: a tela confere o histórico e o mesmo pedido repetido não duplica', async ({ browser }) => {
  const context = await bidderContext(browser, 'resposta-perdida');
  const lotId = await seedLotId(context);
  const before = (await (await context.request.get(`/api/lots/${lotId}/bids`)).json()).bids.length as number;
  const page = await context.newPage();

  // O pedido chega ao servidor (que grava e responde 201), mas a resposta não chega ao navegador.
  let usedKey = '';
  let serverStatus = 0;
  await page.route(`**/api/lots/${lotId}/bids`, async (route) => {
    if (route.request().method() !== 'POST' || usedKey) return route.continue();
    usedKey = route.request().headers()['idempotency-key'];
    serverStatus = (await route.fetch()).status();
    await route.abort('connectionreset');
  });

  await page.goto(`/lotes/${lotId}`);
  await page.getByLabel('Seu lance (R$)').fill('500,00');
  await page.getByRole('button', { name: 'Dar lance' }).click();

  // A tela não diz "recusado" nem reenvia sozinha: relê o histórico e encontra o lance.
  await expect(page.getByText(/A resposta se perdeu, mas o histórico do servidor mostra o seu lance de R\$\s500,00/)).toBeVisible();
  await expect(page.locator('.my-standing .badge')).toHaveText('Você está ganhando');
  expect(serverStatus).toBe(201);
  expect(usedKey).not.toBe('');

  // O mesmo pedido repetido (mesma chave) devolve a resposta guardada e não cria outro lance.
  const replay = await context.request.post(`/api/lots/${lotId}/bids`, {
    data: { amountCents: 50_000 },
    headers: { 'Idempotency-Key': usedKey },
  });
  expect(replay.status()).toBe(201);
  expect(replay.headers()['idempotent-replayed']).toBe('true');
  const after = (await (await context.request.get(`/api/lots/${lotId}/bids`)).json()).bids.length as number;
  expect(after).toBe(before + 1);
});

test('evento perdido com o tempo real fora e volta da aba (suspensão): a tela se recupera pelo HTTP', async ({ browser }) => {
  const visitorContext = await browser.newContext();
  const page = await visitorContext.newPage();
  const lotId = await seedLotId(visitorContext);

  // Liga e desliga o Socket.IO só desta aba (polling HTTP e WebSocket).
  let blocked = false;
  const sockets: { close: (options?: { code?: number; reason?: string }) => Promise<void> }[] = [];
  await page.route('**/socket.io/**', (route) => (blocked ? route.abort() : route.continue()));
  await page.routeWebSocket(/\/socket\.io\//, (ws) => {
    if (blocked) return ws.close();
    const server = ws.connectToServer();
    sockets.push(ws, server); // fechar os dois lados derruba a conexão de fato
  });

  await page.goto(`/lotes/${lotId}`);
  await expect(page.getByText('Tempo real conectado')).toBeVisible();
  const countBefore = await page.locator('.bid-history li').count();

  // "Suspensão": o tempo real cai e outra pessoa dá um lance que esta aba não recebe.
  blocked = true;
  await Promise.all(sockets.map((side) => side.close({ code: 1001, reason: 'suspensão simulada' })));
  // Em long-polling, a queda só aparece quando a requisição em andamento volta (ping a cada 25 s).
  await expect(page.getByText(/Sem tempo real/)).toBeVisible({ timeout: 60_000 });
  const other = await bidderContext(browser, 'outro');
  const minimum = (await (await other.request.get(`/api/lots/${lotId}`)).json()).lot.nextMinimumBidCents as number;
  const accepted = await other.request.post(`/api/lots/${lotId}/bids`, {
    data: { amountCents: minimum },
    headers: { 'Idempotency-Key': randomUUID() },
  });
  expect(accepted.status()).toBe(201);
  await page.waitForTimeout(1_000);
  await expect(page.locator('.bid-history li')).toHaveCount(countBefore); // o evento se perdeu mesmo

  // A aba "volta" (foco): busca o estado pelo HTTP, ainda sem tempo real.
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('.bid-history li')).toHaveCount(countBefore + 1);
  await expect(page.getByText(/Sem tempo real/)).toBeVisible();

  // O tempo real volta sozinho (reconexão automática).
  blocked = false;
  await expect(page.getByText('Tempo real conectado')).toBeVisible({ timeout: 20_000 });
});

test('imagem do museu falhando: a tela mostra a imagem substituta local com texto alternativo', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route('**/openaccess-cdn.clevelandart.org/**', (route) => route.abort());
  const lotId = await seedLotId(context);

  await page.goto(`/lotes/${lotId}`);
  const image = page.locator('.lot-room-image');
  await expect(image).toHaveAttribute('src', '/obra-sem-imagem.svg');
  await expect(image).toHaveAttribute('alt', /\(imagem indisponível\)$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible(); // o resto do lote continua
});
