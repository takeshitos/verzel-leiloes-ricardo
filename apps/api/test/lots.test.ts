// Gestão de lotes com rotas, middlewares e banco reais. O museu é o servidor local de teste.
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runSeed } from '../src/db/seed-data.js';
import { createCatalogClient } from '../src/modules/catalog/client.js';
import { fixtureItem152006, sendJson, startCatalogStub, type CatalogStub } from './catalog-stub.js';
import { createTestApp, createTestPool, resetDatabase, sessionCookie } from './helpers.js';

const pool = createTestPool();
let stub: CatalogStub;
let app: ReturnType<typeof createTestApp>;
let seller: string;
let bidder: string;

const HASH = 'a'.repeat(64);
const minutesFromNow = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

async function login(email: string) {
  return sessionCookie(await request(app).post('/api/auth/login').send({ email, password: 'leilao-demo-2026' }));
}

function validLot(overrides: Record<string, unknown> = {}) {
  return {
    externalId: '152006',
    startingBidCents: 100_000,
    minIncrementCents: 10_000,
    startsAt: minutesFromNow(0),
    endsAt: minutesFromNow(60),
    ...overrides,
  };
}

async function createLot(body: Record<string, unknown> = validLot(), cookie = seller) {
  return request(app).post('/api/lots').set('Cookie', cookie).send(body);
}

async function userId(email: string) {
  return (await pool.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [email])).rows[0].id;
}

/** Simula um lance já gravado (o serviço de lances chega na etapa 09). */
async function insertBid(lotId: string, bidderEmail = 'cliente1@example.com', amount = 100_000) {
  const bidderId = await userId(bidderEmail);
  const bid = await pool.query<{ id: string }>(
    `INSERT INTO bids (lot_id, seq, bidder_id, public_alias, amount_cents, accepted_at, bidder_ref, prev_hash, hash)
     SELECT $1, 1, $2, public_alias, $3, now(), $4, $4, $4 FROM users WHERE id = $2
     RETURNING id`,
    [lotId, bidderId, amount, HASH],
  );
  await pool.query('UPDATE lots SET bid_count = 1, leader_bid_id = $2 WHERE id = $1', [lotId, bid.rows[0].id]);
}

/** Cria lote com datas arbitrárias direto no banco (ex.: já encerrado), reaproveitando o snapshot do seed. */
async function insertLotAt(startsAt: string, endsAt: string, sellerEmail = 'leiloeiro@example.com') {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO lots (seller_id, snapshot_id, starting_bid_cents, min_increment_cents, starts_at, original_ends_at, ends_at)
     SELECT $1, (SELECT id FROM item_snapshots LIMIT 1), 5000, 500, $2, $3, $3
     RETURNING id`,
    [await userId(sellerEmail), startsAt, endsAt],
  );
  return result.rows[0].id;
}

beforeEach(async () => {
  await resetDatabase(pool);
  await runSeed(pool);
  stub = await startCatalogStub();
  app = createTestApp(pool, { catalog: createCatalogClient({ baseUrl: stub.baseUrl, timeoutMs: 500 }) });
  seller = await login('leiloeiro@example.com');
  bidder = await login('cliente1@example.com');
});

afterEach(async () => {
  await stub.close();
});

afterAll(async () => {
  await pool.end();
});

describe('criar lote', () => {
  it('cria lote ao vivo com dados da obra vindos do museu e dono vindo da sessão', async () => {
    const response = await createLot();

    expect(response.status).toBe(201);
    expect(response.body.lot).toMatchObject({
      status: 'live',
      settled: false,
      startingBidCents: 100_000,
      minIncrementCents: 10_000,
      nextMinimumBidCents: 100_000,
      bidCount: 0,
      sellerAlias: expect.stringMatching(/^VEN-/),
      item: { title: fixtureItem152006.data.title, image: { url: fixtureItem152006.data.images.web.url } },
      source: { externalId: '152006', license: 'CC0' },
    });

    const stored = await pool.query(
      `SELECT u.email, s.title, s.raw->>'id' AS raw_id
         FROM lots l JOIN users u ON u.id = l.seller_id JOIN item_snapshots s ON s.id = l.snapshot_id
        WHERE l.id = $1`,
      [response.body.lot.id],
    );
    expect(stored.rows[0]).toEqual({ email: 'leiloeiro@example.com', title: fixtureItem152006.data.title, raw_id: '152006' });
    expect(stub.requests.map((url) => url.pathname)).toEqual(['/api/artworks/152006']);
  });

  it('guarda datas em UTC, aceitando qualquer fuso na entrada', async () => {
    const start = new Date(Date.now() + 10 * 60_000);
    start.setUTCSeconds(0, 0);
    const local = new Date(start.getTime() - 3 * 3_600_000).toISOString().replace('Z', '-03:00'); // mesmo instante em -03:00
    const response = await createLot(validLot({ startsAt: local, endsAt: minutesFromNow(120) }));

    expect(response.status).toBe(201);
    expect(response.body.lot.startsAt).toBe(start.toISOString());
    expect(response.body.lot.status).toBe('scheduled');
  });

  it('recusa título, imagem ou dono enviados pelo cliente', async () => {
    const response = await createLot(
      validLot({ title: 'Obra falsa', imageUrl: 'https://site-malicioso.example/x.jpg', sellerId: await userId('cliente1@example.com') }),
    );
    expect(response.status).toBe(400);
    expect(response.body.error.details.fields._).toMatch(/title|imageUrl|sellerId/);
  });

  it.each([
    ['lance inicial zero', { startingBidCents: 0 }, 'startingBidCents'],
    ['lance inicial negativo', { startingBidCents: -100 }, 'startingBidCents'],
    ['lance inicial com decimais', { startingBidCents: 100.5 }, 'startingBidCents'],
    ['lance inicial como texto', { startingBidCents: '1000' }, 'startingBidCents'],
    ['incremento zero', { minIncrementCents: 0 }, 'minIncrementCents'],
    ['valor acima do limite', { startingBidCents: 10_000_000_001 }, 'startingBidCents'],
    ['data sem fuso', { startsAt: '2026-12-01T10:00:00' }, 'startsAt'],
    ['data inválida', { endsAt: 'amanhã' }, 'endsAt'],
    ['fim antes do início', { startsAt: minutesFromNow(30), endsAt: minutesFromNow(10) }, 'endsAt'],
    ['obra com id inválido', { externalId: '../admin' }, 'externalId'],
  ])('recusa %s com 400', async (_label, override, field) => {
    const response = await createLot(validLot(override));
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details.fields[field]).toBeTruthy();
  });

  it.each([
    ['início no passado', { startsAt: minutesFromNow(-30), endsAt: minutesFromNow(30) }, 'startsAt', 'passado'],
    ['início mais de 90 dias à frente', { startsAt: minutesFromNow(91 * 24 * 60), endsAt: minutesFromNow(92 * 24 * 60) }, 'startsAt', '90 dias'],
    ['duração menor que 2 minutos', { startsAt: minutesFromNow(5), endsAt: minutesFromNow(6) }, 'endsAt', '2 minutos'],
    ['duração maior que 30 dias', { startsAt: minutesFromNow(0), endsAt: minutesFromNow(31 * 24 * 60) }, 'endsAt', '30 dias'],
  ])('recusa %s com 400 (conferido com o relógio do banco)', async (_label, override, field, text) => {
    const response = await createLot(validLot(override));
    expect(response.status).toBe(400);
    expect(response.body.error.details.fields[field]).toContain(text);
  });

  it('obra inexistente no museu: 404; sem imagem: 422; museu fora do ar: 503. Nenhum lote criado', async () => {
    expect((await createLot(validLot({ externalId: '123' }))).status).toBe(404);

    stub.setHandler((_req, res) => sendJson(res, 200, { data: { ...fixtureItem152006.data, images: null } }));
    const withoutImage = await createLot();
    expect(withoutImage.status).toBe(422);
    expect(withoutImage.body.error.code).toBe('CATALOG_ITEM_WITHOUT_IMAGE');

    await stub.close();
    const offlineApp = createTestApp(pool, { catalog: createCatalogClient({ baseUrl: stub.baseUrl, timeoutMs: 300 }) });
    const offline = await request(offlineApp).post('/api/lots').set('Cookie', seller).send(validLot());
    expect(offline.status).toBe(503);

    const count = await pool.query("SELECT count(*) AS total FROM lots WHERE seed_key IS NULL");
    expect(count.rows[0].total).toBe(0);
    stub = await startCatalogStub(); // para o afterEach
  });

  it('licitante não cria lote (403) e visitante recebe 401', async () => {
    expect((await createLot(validLot(), bidder)).status).toBe(403);
    expect((await request(app).post('/api/lots').send(validLot())).status).toBe(401);
    expect(stub.requests).toHaveLength(0);
  });
});

describe('estado do lote e vitrine', () => {
  it('vitrine separa ao vivo, agendados e encerrados e nunca mostra cancelados', async () => {
    const live = (await createLot()).body.lot.id;
    const scheduled = (await createLot(validLot({ startsAt: minutesFromNow(30), endsAt: minutesFromNow(90) }))).body.lot.id;
    const ended = await insertLotAt(minutesFromNow(-120), minutesFromNow(-60));
    const cancelled = (await createLot()).body.lot.id;
    expect((await request(app).post(`/api/lots/${cancelled}/cancel`).set('Cookie', seller)).status).toBe(200);

    const response = await request(app).get('/api/lots');
    expect(response.status).toBe(200);
    const ids = (group: { id: string }[]) => group.map((lot) => lot.id);
    expect(ids(response.body.live)).toContain(live);
    expect(ids(response.body.scheduled)).toEqual([scheduled]);
    expect(ids(response.body.ended)).toEqual([ended]);
    expect(JSON.stringify(response.body)).not.toContain(cancelled);
    expect(response.body.ended[0]).toMatchObject({ status: 'ended', settled: false, result: null });
    expect(JSON.stringify(response.body)).not.toMatch(/@|seller_id|password/);
  });

  it('o estado vem do horário, sem coluna de status para ficar desatualizada', async () => {
    const id = (await createLot(validLot({ startsAt: minutesFromNow(30), endsAt: minutesFromNow(90) }))).body.lot.id;
    expect((await request(app).get(`/api/lots/${id}`)).body.lot.status).toBe('scheduled');

    await pool.query("UPDATE lots SET starts_at = now() - interval '1 minute' WHERE id = $1", [id]);
    expect((await request(app).get(`/api/lots/${id}`)).body.lot.status).toBe('live');

    await pool.query(
      "UPDATE lots SET starts_at = now() - interval '2 hours', original_ends_at = now() - interval '1 second', ends_at = now() - interval '1 second' WHERE id = $1",
      [id],
    );
    expect((await request(app).get(`/api/lots/${id}`)).body.lot).toMatchObject({ status: 'ended', settled: false });
  });
});

describe('cancelar lote', () => {
  it('dono cancela lote sem lances; repetir responde 409', async () => {
    const id = (await createLot()).body.lot.id;

    const first = await request(app).post(`/api/lots/${id}/cancel`).set('Cookie', seller);
    expect(first.status).toBe(200);
    expect(first.body.lot.status).toBe('cancelled');

    const again = await request(app).post(`/api/lots/${id}/cancel`).set('Cookie', seller);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('LOT_ALREADY_CANCELLED');
  });

  it('dono pode cancelar lote ainda agendado', async () => {
    const id = (await createLot(validLot({ startsAt: minutesFromNow(30), endsAt: minutesFromNow(90) }))).body.lot.id;
    expect((await request(app).post(`/api/lots/${id}/cancel`).set('Cookie', seller)).status).toBe(200);
  });

  it('recusa cancelar lote com lance, sem alterar nada', async () => {
    const id = (await createLot()).body.lot.id;
    await insertBid(id);

    const response = await request(app).post(`/api/lots/${id}/cancel`).set('Cookie', seller);
    expect(response.status).toBe(409);
    expect(response.body.error).toEqual({ code: 'LOT_HAS_BIDS', message: 'Não é possível cancelar: o lote já recebeu lances.' });

    const lot = await pool.query('SELECT cancelled_at, bid_count, version FROM lots WHERE id = $1', [id]);
    expect(lot.rows[0]).toEqual({ cancelled_at: null, bid_count: 1, version: 0 });
  });

  it('recusa cancelar lote encerrado', async () => {
    const id = await insertLotAt(minutesFromNow(-120), minutesFromNow(-1));
    const response = await request(app).post(`/api/lots/${id}/cancel`).set('Cookie', seller);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('LOT_ENDED');
  });

  it('outro leiloeiro recebe 403; licitante 403; lote inexistente 404', async () => {
    const id = (await createLot()).body.lot.id;
    const other = sessionCookie(
      await request(app).post('/api/auth/register').send({ email: 'outro@example.com', password: 'senha-forte-123', role: 'seller' }),
    );

    expect((await request(app).post(`/api/lots/${id}/cancel`).set('Cookie', other)).status).toBe(403);
    expect((await request(app).post(`/api/lots/${id}/cancel`).set('Cookie', bidder)).status).toBe(403);
    expect((await request(app).post('/api/lots/00000000-0000-4000-8000-000000000000/cancel').set('Cookie', seller)).status).toBe(404);
    expect((await request(app).get(`/api/lots/${id}`)).body.lot.status).toBe('live');
  });

  it('cancelamento que chega enquanto um lance segura o bloqueio do lote espera e então recusa', async () => {
    const id = (await createLot()).body.lot.id;
    const bidderId = await userId('cliente1@example.com');

    // Transação "lance" (mesma ordem de bloqueio que o serviço de lances usará): bloqueia o lote primeiro.
    const bidTx = await pool.connect();
    await bidTx.query('BEGIN');
    await bidTx.query('SELECT id FROM lots WHERE id = $1 FOR UPDATE', [id]);

    // O cancelamento começa e fica esperando o bloqueio.
    const cancelPromise = request(app).post(`/api/lots/${id}/cancel`).set('Cookie', seller).then((response) => response);
    await waitForLockWaiter();

    // O lance é gravado e confirmado enquanto o cancelamento espera.
    const bid = await bidTx.query<{ id: string }>(
      `INSERT INTO bids (lot_id, seq, bidder_id, public_alias, amount_cents, accepted_at, bidder_ref, prev_hash, hash)
       SELECT $1, 1, $2, public_alias, 100000, now(), $3, $3, $3 FROM users WHERE id = $2 RETURNING id`,
      [id, bidderId, HASH],
    );
    await bidTx.query('UPDATE lots SET bid_count = 1, leader_bid_id = $2 WHERE id = $1', [id, bid.rows[0].id]);
    await bidTx.query('COMMIT');
    bidTx.release();

    const cancelResponse = await cancelPromise;
    expect(cancelResponse.status).toBe(409);
    expect(cancelResponse.body.error.code).toBe('LOT_HAS_BIDS');
    expect((await pool.query('SELECT cancelled_at FROM lots WHERE id = $1', [id])).rows[0].cancelled_at).toBeNull();
  });

  // Completar na etapa 09, com o serviço de lances real: disparar POST /api/lots/:id/bids e
  // POST /api/lots/:id/cancel ao mesmo tempo, várias vezes, e verificar que sempre há
  // exatamente um vencedor (lote cancelado sem lances OU lote com lance e não cancelado).
  it.todo('cancelamento e primeiro lance simultâneos pelo serviço de lances real: só um vence');
});

describe('painel do leiloeiro', () => {
  it('lista só os lotes do próprio leiloeiro, inclusive cancelados', async () => {
    const mine = (await createLot()).body.lot.id;
    await request(app).post(`/api/lots/${mine}/cancel`).set('Cookie', seller);
    const otherSellerCookie = sessionCookie(
      await request(app).post('/api/auth/register').send({ email: 'outro@example.com', password: 'senha-forte-123', role: 'seller' }),
    );
    const theirs = (await createLot(validLot(), otherSellerCookie)).body.lot.id;

    const response = await request(app).get('/api/seller/lots').set('Cookie', seller);
    const ids = response.body.lots.map((lot: { id: string }) => lot.id);
    expect(ids).toContain(mine);
    expect(ids).not.toContain(theirs);
    expect(response.body.lots.find((lot: { id: string }) => lot.id === mine).status).toBe('cancelled');
  });

  it('total recebido é zero com lance e reserva ativos: reserva não é receita', async () => {
    const id = (await createLot()).body.lot.id;
    await insertBid(id);
    const leader = await pool.query<{ leader_bid_id: string }>('SELECT leader_bid_id FROM lots WHERE id = $1', [id]);
    await pool.query('INSERT INTO reservations (lot_id, bidder_id, bid_id, amount_cents) VALUES ($1, $2, $3, 100000)', [
      id,
      await userId('cliente1@example.com'),
      leader.rows[0].leader_bid_id,
    ]);

    const response = await request(app).get('/api/seller/summary').set('Cookie', seller);
    expect(response.status).toBe(200);
    expect(response.body.summary).toMatchObject({ totalReceivedCents: 0, soldLots: 0 });
    expect(response.body.summary.lotsByStatus.live).toBe(2); // lote do seed + este
  });

  it('total recebido soma só créditos de liquidação lançados na carteira', async () => {
    const ended = await insertLotAt(minutesFromNow(-120), minutesFromNow(-1));
    await pool.query(
      "INSERT INTO wallet_entries (user_id, kind, amount_cents, operation_key, lot_id) VALUES ($1, 'settlement_credit', 123450, 'teste:credito', $2)",
      [await userId('leiloeiro@example.com'), ended],
    );

    const response = await request(app).get('/api/seller/summary').set('Cookie', seller);
    expect(response.body.summary).toMatchObject({ totalReceivedCents: 123450, soldLots: 1, endedAwaitingSettlement: 1 });
  });

  it('licitante não acessa o painel do leiloeiro', async () => {
    expect((await request(app).get('/api/seller/lots').set('Cookie', bidder)).status).toBe(403);
    expect((await request(app).get('/api/seller/summary').set('Cookie', bidder)).status).toBe(403);
  });
});

/** Espera até haver uma consulta parada aguardando bloqueio no banco de teste. */
async function waitForLockWaiter(): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const waiting = await pool.query(
      "SELECT count(*) AS total FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'",
    );
    if (waiting.rows[0].total > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('O cancelamento não ficou aguardando o bloqueio do lote.');
}
