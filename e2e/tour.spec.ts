// Tour guiado pela interface real: convite, controles, Esc, persistência após recarregar,
// continuação vitrine → sala, tours por perfil, elemento ausente, celular e saída da sessão.
// O tour nunca altera dados: o teste confere o saldo no servidor antes e depois.
import { expect, test, type Browser, type Page } from '@playwright/test';

const PASSWORD = 'senha-e2e-2026';
const run = Date.now().toString(36);

async function register(browser: Browser, role: 'Licitante' | 'Leiloeiro', name: string, viewport?: { width: number; height: number }) {
  const page = await (await browser.newContext(viewport ? { viewport } : {})).newPage();
  await page.goto('/entrar?modo=cadastro');
  await page.getByLabel('Email').fill(`e2e-tour-${name}-${run}@example.test`);
  await page.getByLabel('Senha').fill(PASSWORD);
  await page.getByRole('radio', { name: new RegExp(role) }).check();
  await page.locator('form').getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible();
  return page;
}

const card = (page: Page) => page.getByRole('dialog');
const invite = (page: Page) => page.getByRole('complementary', { name: 'Convite para o tour guiado' });

async function openPageTour(page: Page, pageName: string) {
  await page.getByRole('button', { name: 'Como usar' }).click();
  await page.getByRole('button', { name: new RegExp(`Tour desta página \\(${pageName}\\)`) }).click();
  await expect(card(page)).toBeVisible();
}

/** Avança até a última etapa e devolve os títulos vistos. */
async function walkToEnd(page: Page): Promise<string[]> {
  const titles: string[] = [];
  for (let guard = 0; guard < 20; guard++) {
    titles.push((await card(page).getByRole('heading').textContent()) ?? '');
    const next = card(page).getByRole('button', { name: 'Próximo' });
    if (!(await next.isVisible())) break;
    await next.click();
  }
  return titles;
}

test('visitante: convite uma vez, controles, Esc e continuação da vitrine para a sala', async ({ browser }) => {
  // "Agora não" fecha o convite e ele não volta ao recarregar.
  const first = await (await browser.newContext()).newPage();
  await first.goto('/');
  await expect(invite(first)).toBeVisible();
  await invite(first).getByRole('button', { name: 'Agora não' }).click();
  await expect(invite(first)).toBeHidden();
  await first.reload();
  await expect(first.getByRole('heading', { name: 'Obras em disputa' })).toBeVisible();
  await expect(invite(first)).toBeHidden();

  // "Iniciar tour": tour geral com progresso, Próximo/Anterior e Esc.
  const page = await (await browser.newContext()).newPage();
  await page.goto('/');
  await invite(page).getByRole('button', { name: 'Iniciar tour' }).click();
  await expect(card(page)).toContainText('Etapa 1 de 5');
  await expect(card(page).getByRole('heading')).toHaveText('Bem-vindo à Casa de Leilões');
  await card(page).getByRole('button', { name: 'Próximo' }).click();
  await expect(card(page)).toContainText('Etapa 2 de 5');
  await expect(page.locator('.tour-spotlight')).toBeVisible(); // destaca a navegação
  await card(page).getByRole('button', { name: 'Anterior' }).click();
  await expect(card(page)).toContainText('Etapa 1 de 5');
  await page.keyboard.press('Escape');
  await expect(card(page)).toBeHidden();
  await expect(page.locator('.tour-spotlight')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Obras em disputa' })).toBeVisible();
  await expect(invite(page)).toBeHidden();

  // Tour da vitrine → "Abrir a sala do primeiro lote e continuar" → tour da sala.
  await openPageTour(page, 'Vitrine');
  const vitrine = await walkToEnd(page);
  expect(vitrine).toEqual(['Vitrine', 'Conexão em tempo real', 'Filtrar a vitrine', 'Ao vivo, agendados e encerrados', 'Card do lote']);
  await card(page).getByRole('button', { name: 'Abrir a sala do primeiro lote e continuar' }).click();
  await expect(page).toHaveURL(/\/lotes\/[0-9a-f-]{36}$/);
  await expect(card(page).getByRole('heading')).toHaveText('Sala do lote');
  const sala = await walkToEnd(page);
  expect(sala).toContain('Tempo e prorrogação');
  expect(sala).toContain('Histórico de lances');
  expect(sala).not.toContain('Dar lance'); // visitante não vê a etapa do formulário de lance
  await card(page).getByRole('button', { name: 'Concluir' }).click();
  await expect(card(page)).toBeHidden();

  // Preferência guardada sem dados pessoais (só perfil, ids de tour e convite visto).
  const stored = await page.evaluate(() => window.localStorage.getItem('leiloes.tour.v1'));
  expect(stored).toContain('"vitrine"');
  expect(stored).toContain('"sala"');
  expect(stored).not.toMatch(/@|LIC-|VEN-/);
});

test('licitante: tours da carteira e participações não alteram o saldo; sair encerra o tour', async ({ browser }) => {
  const page = await register(browser, 'Licitante', 'licitante');
  await expect(invite(page)).toContainText('Conta de licitante pronta');
  const before = await (await page.request.get('/api/wallet')).json();

  await page.goto('/carteira');
  await openPageTour(page, 'Carteira');
  const carteira = await walkToEnd(page);
  expect(carteira).toEqual(['Disponível, reservado e total', 'Reserva e liberação', 'Depósito simulado', 'Últimos lançamentos']);
  await card(page).getByRole('button', { name: 'Concluir' }).click();
  // Foco volta ao botão "Como usar" (de onde o tour foi aberto).
  await expect(page.getByRole('button', { name: 'Como usar' })).toBeFocused();

  // Participações vazia: a etapa da lista explica em vez de destacar algo que não existe.
  await page.getByRole('link', { name: 'Participações' }).click();
  await expect(page.getByText('Você ainda não deu lances.')).toBeVisible();
  await openPageTour(page, 'Participações');
  await card(page).getByRole('button', { name: 'Próximo' }).click();
  await expect(card(page).getByRole('heading')).toHaveText('Cada participação');
  await expect(card(page)).toContainText('Você ainda não deu lances. Quando der');
  await expect(card(page)).toContainText('Etapa 2 de 2'); // etapas opcionais sem elemento saíram

  // Sair com o tour aberto encerra o tour (nada privado continua na tela).
  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page.getByRole('link', { name: 'Entrar' })).toBeVisible();
  await expect(card(page)).toBeHidden();

  // Nenhum depósito, lance ou lançamento foi criado pelo tour.
  const login = await page.request.post('/api/auth/login', {
    data: { email: `e2e-tour-licitante-${run}@example.test`, password: PASSWORD },
  });
  expect(login.ok()).toBe(true);
  const after = await (await page.request.get('/api/wallet')).json();
  expect(after.wallet).toEqual(before.wallet);
  expect(after.wallet.recentEntries).toEqual([]);
});

test('leiloeiro no celular: tour do painel em folha no rodapé, sem etapa de cancelar sem lotes', async ({ browser }) => {
  const page = await register(browser, 'Leiloeiro', 'leiloeiro', { width: 375, height: 812 });
  await expect(page).toHaveURL(/\/painel$/);
  await invite(page).getByRole('button', { name: 'Agora não' }).click();
  await openPageTour(page, 'Painel');
  await expect(card(page)).toHaveClass(/tour-card-sheet/);
  const painel = await walkToEnd(page);
  expect(painel).toEqual(['Resumo e total recebido', 'Buscar obra no acervo', 'Criar lote', 'Seus lotes']);
  await page.keyboard.press('Escape');
  await expect(card(page)).toBeHidden();
  // Leiloeiro não tem tour de carteira: a opção não aparece no menu fora das páginas dele.
  await page.goto('/sobre');
  await page.getByRole('button', { name: 'Como usar' }).click();
  await expect(page.getByText('Esta página não tem tour próprio.')).toBeVisible();
});

test('tempo real continua com o tour aberto: um lance de outra pessoa aparece sem recarregar', async ({ browser }) => {
  // Visitante segue do tour da vitrine para a sala do primeiro lote (ao vivo, do seed).
  const viewer = await (await browser.newContext()).newPage();
  await viewer.goto('/');
  await openPageTour(viewer, 'Vitrine');
  await walkToEnd(viewer);
  await card(viewer).getByRole('button', { name: 'Abrir a sala do primeiro lote e continuar' }).click();
  await expect(card(viewer).getByRole('heading')).toHaveText('Sala do lote');
  const lotId = viewer.url().split('/lotes/')[1];
  while ((await card(viewer).getByRole('heading').textContent()) !== 'Histórico de lances') {
    await card(viewer).getByRole('button', { name: 'Próximo' }).click();
  }

  // Outra pessoa (licitante no banco de teste) deposita e dá o lance mínimo pela API.
  const bidder = await register(browser, 'Licitante', 'tempo-real');
  const { lot } = await (await bidder.request.get(`/api/lots/${lotId}`)).json();
  const amountCents = lot.nextMinimumBidCents as number;
  const headers = (key: string) => ({ 'Idempotency-Key': `${key}-${run}` });
  expect((await bidder.request.post('/api/wallet/deposits', { data: { amountCents }, headers: headers('dep') })).ok()).toBe(true);
  expect((await bidder.request.post(`/api/lots/${lotId}/bids`, { data: { amountCents }, headers: headers('bid') })).ok()).toBe(true);
  const { user } = await (await bidder.request.get('/api/auth/me')).json();

  // A sala do visitante recebe o lance pelo tempo real; o tour continua na mesma etapa.
  await expect(viewer.locator('.bid-history li').first()).toContainText(user.publicAlias);
  await expect(card(viewer).getByRole('heading')).toHaveText('Histórico de lances');
  await expect(viewer.locator('.tour-spotlight')).toBeVisible();
});
