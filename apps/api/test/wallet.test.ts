// Carteira e depósitos com rotas e banco reais. Reservas são inseridas direto no banco
// (o serviço de lances que as cria chega na etapa 09).
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { runSeed } from '../src/db/seed-data.js';
import { MAX_WALLET_TOTAL_CENTS } from '../src/shared/money.js';
import { createTestApp, createTestPool, resetDatabase, sessionCookie } from './helpers.js';

const pool = createTestPool();
let app: ReturnType<typeof createTestApp>;
let newBidder: string; // licitante recém-cadastrado, saldo zero
const HASH = 'b'.repeat(64);

async function login(email: string) {
  return sessionCookie(await request(app).post('/api/auth/login').send({ email, password: 'leilao-demo-2026' }));
}

async function userId(email: string) {
  return (await pool.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [email])).rows[0].id;
}

function postDeposit(cookie: string, body: unknown, key: string | null = `dep-${crypto.randomUUID()}`) {
  const req = request(app).post('/api/wallet/deposits').set('Cookie', cookie);
  if (key !== null) req.set('Idempotency-Key', key);
  return req.send(body as object);
}

async function getWallet(cookie: string) {
  const response = await request(app).get('/api/wallet').set('Cookie', cookie);
  expect(response.status).toBe(200);
  return response.body.wallet as { totalCents: number; committedCents: number; availableCents: number };
}

/** Reserva de teste: um lote ao vivo com um lance líder do usuário e a reserva correspondente. */
async function addReservation(bidderEmail: string, amountCents: number) {
  const bidderId = await userId(bidderEmail);
  const lot = await pool.query<{ id: string }>(
    `INSERT INTO lots (seller_id, snapshot_id, starting_bid_cents, min_increment_cents, starts_at, original_ends_at, ends_at)
     SELECT (SELECT id FROM users WHERE email = 'leiloeiro@example.com'), (SELECT id FROM item_snapshots LIMIT 1),
            1000, 100, now() - interval '1 minute', now() + interval '1 hour', now() + interval '1 hour'
     RETURNING id`,
  );
  const bid = await pool.query<{ id: string }>(
    `INSERT INTO bids (lot_id, seq, bidder_id, public_alias, amount_cents, accepted_at, bidder_ref, prev_hash, hash)
     SELECT $1, 1, $2, public_alias, $3, now(), $4, $4, $4 FROM users WHERE id = $2 RETURNING id`,
    [lot.rows[0].id, bidderId, amountCents, HASH],
  );
  await pool.query('UPDATE lots SET bid_count = 1, leader_bid_id = $2 WHERE id = $1', [lot.rows[0].id, bid.rows[0].id]);
  await pool.query('INSERT INTO reservations (lot_id, bidder_id, bid_id, amount_cents) VALUES ($1, $2, $3, $4)', [
    lot.rows[0].id,
    bidderId,
    bid.rows[0].id,
    amountCents,
  ]);
}

async function ledgerOf(email: string) {
  const result = await pool.query<{ total: number; entries: number; entries_sum: number }>(
    `SELECT w.total_cents AS total,
            (SELECT count(*) FROM wallet_entries e WHERE e.user_id = w.user_id) AS entries,
            (SELECT coalesce(sum(CASE WHEN e.kind = 'settlement_debit' THEN -e.amount_cents ELSE e.amount_cents END), 0)::bigint
               FROM wallet_entries e WHERE e.user_id = w.user_id) AS entries_sum
       FROM wallets w JOIN users u ON u.id = w.user_id WHERE u.email = $1`,
    [email],
  );
  return result.rows[0];
}

beforeEach(async () => {
  await resetDatabase(pool);
  await runSeed(pool);
  app = createTestApp(pool);
  newBidder = sessionCookie(
    await request(app).post('/api/auth/register').send({ email: 'nova@example.com', password: 'senha-forte-123', role: 'bidder' }),
  );
});

afterAll(async () => {
  await pool.end();
});

describe('consulta da carteira', () => {
  it('licitante novo começa com tudo zerado e a carteira se declara simulada', async () => {
    const response = await request(app).get('/api/wallet').set('Cookie', newBidder);
    expect(response.status).toBe(200);
    expect(response.body.wallet).toEqual({ totalCents: 0, committedCents: 0, availableCents: 0, simulated: true, recentEntries: [] });
  });

  it('exemplo do enunciado: depósito de R$ 1.000 e reserva de R$ 100 deixam R$ 900 disponíveis', async () => {
    expect((await postDeposit(newBidder, { amountCents: 100_000 })).status).toBe(201);
    await addReservation('nova@example.com', 10_000);

    const wallet = await getWallet(newBidder);
    expect(wallet).toMatchObject({ totalCents: 100_000, committedCents: 10_000, availableCents: 90_000 });
    expect(wallet.totalCents - wallet.committedCents).toBe(wallet.availableCents);
  });

  it('o comprometido soma as reservas de todos os lotes', async () => {
    await postDeposit(newBidder, { amountCents: 100_000 });
    await addReservation('nova@example.com', 10_000);
    await addReservation('nova@example.com', 25_000);

    const wallet = await getWallet(newBidder);
    expect(wallet).toMatchObject({ totalCents: 100_000, committedCents: 35_000, availableCents: 65_000 });
    for (const value of Object.values(wallet).filter((v) => typeof v === 'number')) expect(value).toBeGreaterThanOrEqual(0);
  });

  it('cada um vê só a própria carteira: id na URL ou no corpo não muda nada', async () => {
    const otherId = await userId('cliente1@example.com');
    const mine = await request(app).get(`/api/wallet?userId=${otherId}`).set('Cookie', newBidder);
    expect(mine.body.wallet.totalCents).toBe(0); // não é a carteira do cliente1 (R$ 10.000)

    const withUserId = await postDeposit(newBidder, { amountCents: 1_000, userId: otherId });
    expect(withUserId.status).toBe(400);
    expect(withUserId.body.error.details.fields._).toContain('userId');
    expect((await ledgerOf('cliente1@example.com')).total).toBe(1_000_000);
  });

  it('leiloeiro não tem carteira de licitante (403) e visitante recebe 401', async () => {
    const seller = await login('leiloeiro@example.com');
    expect((await request(app).get('/api/wallet').set('Cookie', seller)).status).toBe(403);
    expect((await postDeposit(seller, { amountCents: 1_000 })).status).toBe(403);
    expect((await request(app).get('/api/wallet')).status).toBe(401);
  });
});

describe('depósito simulado', () => {
  it('registra o lançamento e soma no total na mesma operação', async () => {
    const key = 'deposito-teste-001';
    const response = await postDeposit(newBidder, { amountCents: 100_000 }, key);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      deposit: { amountCents: 100_000, createdAt: expect.any(String), simulated: true },
      wallet: { totalCents: 100_000, committedCents: 0, availableCents: 100_000 },
    });
    const entries = await pool.query("SELECT kind, amount_cents, operation_key FROM wallet_entries WHERE user_id = $1", [
      await userId('nova@example.com'),
    ]);
    expect(entries.rows).toEqual([
      { kind: 'deposit', amount_cents: 100_000, operation_key: `deposit:${await userId('nova@example.com')}:${key}` },
    ]);
    const ledger = await ledgerOf('nova@example.com');
    expect(ledger.total).toBe(ledger.entries_sum);
  });

  it.each([
    ['zero', 0],
    ['negativo', -100],
    ['com decimais', 10.5],
    ['como texto', '1000'],
    ['texto NaN', 'NaN'],
    ['nulo', null],
    ['acima do limite por depósito (R$ 100.000,00)', 10_000_001],
    ['enorme', 1e20],
  ])('recusa valor %s com 400', async (_label, amountCents) => {
    const response = await postDeposit(newBidder, { amountCents });
    expect(response.status).toBe(400);
    expect(response.body.error.details.fields.amountCents).toBeTruthy();
    expect((await ledgerOf('nova@example.com')).entries).toBe(0);
  });

  it('recusa corpo vazio e JSON com Infinity', async () => {
    expect((await postDeposit(newBidder, {})).status).toBe(400);
    const infinity = await request(app)
      .post('/api/wallet/deposits')
      .set('Cookie', newBidder)
      .set('Idempotency-Key', 'deposito-infinito')
      .set('Content-Type', 'application/json')
      .send('{"amountCents": Infinity}');
    expect(infinity.status).toBe(400);
  });

  it('exige Idempotency-Key válida', async () => {
    const missing = await postDeposit(newBidder, { amountCents: 1_000 }, null);
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');

    expect((await postDeposit(newBidder, { amountCents: 1_000 }, 'curta')).status).toBe(400);
    expect((await postDeposit(newBidder, { amountCents: 1_000 }, 'tem espaço e acento')).status).toBe(400);
  });

  it('recusa passar do saldo máximo simulado, sem gravar nada (nem a chave)', async () => {
    await pool.query(
      "UPDATE wallets SET total_cents = $1 WHERE user_id = (SELECT id FROM users WHERE email = 'nova@example.com')",
      [MAX_WALLET_TOTAL_CENTS - 500],
    );
    const response = await postDeposit(newBidder, { amountCents: 1_000 }, 'deposito-acima-limite');

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('WALLET_LIMIT_EXCEEDED');
    expect((await ledgerOf('nova@example.com')).entries).toBe(0);
    expect((await pool.query("SELECT count(*) AS total FROM idempotency_keys WHERE key = 'deposito-acima-limite'")).rows[0].total).toBe(0);
  });
});

describe('idempotência', () => {
  it('repetir a mesma chave com o mesmo valor devolve a mesma resposta sem depositar de novo', async () => {
    const first = await postDeposit(newBidder, { amountCents: 50_000 }, 'deposito-repetido-01');
    const second = await postDeposit(newBidder, { amountCents: 50_000 }, 'deposito-repetido-01');

    expect(second.status).toBe(201);
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(second.body).toEqual(first.body);
    expect(await ledgerOf('nova@example.com')).toMatchObject({ total: 50_000, entries: 1 });
  });

  it('a mesma chave com outro valor é recusada com 409 e nada muda', async () => {
    await postDeposit(newBidder, { amountCents: 50_000 }, 'deposito-chave-02');
    const other = await postDeposit(newBidder, { amountCents: 70_000 }, 'deposito-chave-02');

    expect(other.status).toBe(409);
    expect(other.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(await ledgerOf('nova@example.com')).toMatchObject({ total: 50_000, entries: 1 });
  });

  it('a chave é por usuário: a mesma chave de outro usuário é outra operação', async () => {
    const otherBidder = await login('cliente2@example.com');
    expect((await postDeposit(newBidder, { amountCents: 1_000 }, 'chave-compartilhada')).status).toBe(201);
    expect((await postDeposit(otherBidder, { amountCents: 1_000 }, 'chave-compartilhada')).status).toBe(201);
    expect((await ledgerOf('nova@example.com')).total).toBe(1_000);
    expect((await ledgerOf('cliente2@example.com')).total).toBe(1_001_000);
  });

  it('8 requisições simultâneas com a mesma chave depositam uma única vez', async () => {
    const responses = await Promise.all(
      Array.from({ length: 8 }, () => postDeposit(newBidder, { amountCents: 30_000 }, 'deposito-simultaneo-01')),
    );

    expect(responses.map((response) => response.status)).toEqual(Array(8).fill(201));
    expect(new Set(responses.map((response) => JSON.stringify(response.body))).size).toBe(1);
    expect(responses.filter((response) => response.headers['idempotent-replayed'] !== 'true')).toHaveLength(1);
    expect(await ledgerOf('nova@example.com')).toMatchObject({ total: 30_000, entries: 1 });
  });

  it('8 depósitos simultâneos com chaves diferentes somam todos, sem perder atualização', async () => {
    const responses = await Promise.all(
      Array.from({ length: 8 }, (_, index) => postDeposit(newBidder, { amountCents: 12_345 }, `deposito-paralelo-${index}`)),
    );

    expect(responses.every((response) => response.status === 201)).toBe(true);
    const ledger = await ledgerOf('nova@example.com');
    expect(ledger).toMatchObject({ total: 8 * 12_345, entries: 8 });
    expect(ledger.total).toBe(ledger.entries_sum);
  });
});
