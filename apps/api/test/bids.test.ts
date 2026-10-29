// Lances com rotas, transações e PostgreSQL reais. Nos testes de concorrência, uma transação
// externa segura o bloqueio; o teste só libera quando o banco mostra TODAS as requisições
// paradas esperando (pg_stat_activity). Isso prova que cada requisição tem sua própria conexão
// e disputa o bloqueio de verdade (não é um Promise.all serializado numa conexão só).
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { runSeed } from '../src/db/seed-data.js';
import { bidderRef, bidHash, genesisHash } from '../src/modules/audit/chain.js';
import { onBidAccepted, type BidAcceptedEvent } from '../src/modules/realtime/events.js';
import { createTestApp, createTestPool, resetDatabase, sessionCookie } from './helpers.js';

const pool = createTestPool(12);
let app: ReturnType<typeof createTestApp>;
let seller: string;
let c1: string; // cliente1@example.com, R$ 10.000,00 do seed
let c2: string; // cliente2@example.com, R$ 10.000,00 do seed

// ---------- auxiliares ----------

async function login(email: string, password = 'leilao-demo-2026') {
  return sessionCookie(await request(app).post('/api/auth/login').send({ email, password }));
}

async function registerBidder(email: string, balanceCents: number) {
  const cookie = sessionCookie(
    await request(app).post('/api/auth/register').send({ email, password: 'senha-forte-123', role: 'bidder' }),
  );
  if (balanceCents > 0) {
    await pool.query(
      `WITH u AS (SELECT id FROM users WHERE email = $1)
       INSERT INTO wallet_entries (user_id, kind, amount_cents, operation_key)
       SELECT id, 'deposit', $2, 'teste:' || $1 FROM u`,
      [email, balanceCents],
    );
    await pool.query('UPDATE wallets SET total_cents = $2 WHERE user_id = (SELECT id FROM users WHERE email = $1)', [
      email,
      balanceCents,
    ]);
  }
  return cookie;
}

async function userId(email: string) {
  return (await pool.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [email])).rows[0].id;
}

/** Lote ao vivo criado direto no banco (o snapshot e o leiloeiro vêm do seed). */
async function createLiveLot(options: { starting?: number; increment?: number; endsInMs?: number; startsInMs?: number } = {}) {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO lots (seller_id, snapshot_id, starting_bid_cents, min_increment_cents, starts_at, original_ends_at, ends_at)
     SELECT (SELECT id FROM users WHERE email = 'leiloeiro@example.com'), (SELECT id FROM item_snapshots LIMIT 1),
            $1, $2, now() + $3 * interval '1 millisecond',
            now() + $4 * interval '1 millisecond', now() + $4 * interval '1 millisecond'
     RETURNING id`,
    [options.starting ?? 10_000, options.increment ?? 1_000, options.startsInMs ?? -60_000, options.endsInMs ?? 3_600_000],
  );
  return result.rows[0].id;
}

function bid(cookie: string, lotId: string, amountCents: unknown, key: string = randomUUID()) {
  return request(app).post(`/api/lots/${lotId}/bids`).set('Cookie', cookie).set('Idempotency-Key', key).send({ amountCents });
}

async function wallet(email: string) {
  const result = await pool.query<{ total: number; committed: number }>(
    `SELECT w.total_cents AS total,
            (SELECT coalesce(sum(amount_cents), 0)::bigint FROM reservations r WHERE r.bidder_id = w.user_id) AS committed
       FROM wallets w JOIN users u ON u.id = w.user_id WHERE u.email = $1`,
    [email],
  );
  const { total, committed } = result.rows[0];
  return { total, committed, available: total - committed };
}

async function lotState(lotId: string) {
  const lot = (
    await pool.query<{ bid_count: number; ends_at: Date; version: number; cancelled_at: Date | null; leader_email: string | null }>(
      `SELECT l.bid_count, l.ends_at, l.version, l.cancelled_at, u.email AS leader_email
         FROM lots l LEFT JOIN bids b ON b.id = l.leader_bid_id LEFT JOIN users u ON u.id = b.bidder_id
        WHERE l.id = $1`,
      [lotId],
    )
  ).rows[0];
  const bids = (
    await pool.query<{ seq: number; amount_cents: number; email: string; prev_hash: string; hash: string }>(
      `SELECT b.seq, b.amount_cents, u.email, b.prev_hash, b.hash
         FROM bids b JOIN users u ON u.id = b.bidder_id WHERE b.lot_id = $1 ORDER BY b.seq`,
      [lotId],
    )
  ).rows;
  const reservations = (
    await pool.query<{ email: string; amount_cents: number }>(
      'SELECT u.email, r.amount_cents FROM reservations r JOIN users u ON u.id = r.bidder_id WHERE r.lot_id = $1',
      [lotId],
    )
  ).rows;
  return { ...lot, bids, reservations };
}

/** Tudo que um lance poderia mudar. Usado para provar que uma recusa não altera nada. */
async function fullSnapshot() {
  const tables = ['lots', 'bids', 'reservations', 'wallets', 'wallet_entries', 'idempotency_keys'];
  const parts: Record<string, unknown> = {};
  for (const table of tables) parts[table] = (await pool.query(`SELECT * FROM ${table} ORDER BY 1`)).rows;
  return JSON.stringify(parts);
}

/** Segura o bloqueio de uma linha numa transação à parte. */
async function holdLock(sql: string, params: unknown[]): Promise<{ client: PoolClient; release: () => Promise<void> }> {
  const client = await pool.connect();
  await client.query('BEGIN');
  await client.query(sql, params);
  return {
    client,
    release: async () => {
      await client.query('COMMIT');
      client.release();
    },
  };
}

const holdLotLock = (lotId: string) => holdLock('SELECT id FROM lots WHERE id = $1 FOR UPDATE', [lotId]);

/** Espera até haver `count` consultas paradas aguardando bloqueio no banco de teste. */
async function waitForLockWaiters(count: number) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const { rows } = await pool.query<{ total: number }>(
      "SELECT count(*) AS total FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'",
    );
    if (rows[0].total >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Esperava ${count} requisições aguardando bloqueio.`);
}

/**
 * Dispara as requisições, espera todas pararem no bloqueio e só então libera.
 * Promise.resolve(...) é necessário: o supertest só envia a requisição quando alguém a aguarda.
 * O bloqueio é liberado mesmo se a espera falhar, para não travar os testes seguintes.
 */
async function raceUnderLock<T>(
  holder: { release: () => Promise<void> },
  requests: (() => PromiseLike<T>)[],
  waiters = requests.length,
): Promise<T[]> {
  const promises = requests.map((start) => Promise.resolve(start()));
  try {
    await waitForLockWaiters(waiters);
  } finally {
    await holder.release();
  }
  return Promise.all(promises);
}

function expectChainIsValid(lotId: string, bids: { seq: number; prev_hash: string; hash: string }[], genesis: string) {
  bids.forEach((current, index) => {
    expect(current.seq).toBe(index + 1);
    expect(current.prev_hash).toBe(index === 0 ? genesis : bids[index - 1].hash);
  });
  void lotId;
}

async function lotGenesis(lotId: string) {
  const lot = (
    await pool.query<{
      seller_id: string;
      snapshot_id: string;
      starting_bid_cents: number;
      min_increment_cents: number;
      starts_at: Date;
      original_ends_at: Date;
    }>('SELECT * FROM lots WHERE id = $1', [lotId])
  ).rows[0];
  return genesisHash({
    lotId,
    sellerId: lot.seller_id,
    snapshotId: lot.snapshot_id,
    startingBidCents: lot.starting_bid_cents,
    minIncrementCents: lot.min_increment_cents,
    startsAt: lot.starts_at,
    originalEndsAt: lot.original_ends_at,
  });
}

beforeEach(async () => {
  await resetDatabase(pool);
  await runSeed(pool);
  app = createTestApp(pool);
  seller = await login('leiloeiro@example.com');
  c1 = await login('cliente1@example.com');
  c2 = await login('cliente2@example.com');
});

afterAll(async () => {
  await pool.end();
});

// ---------- fluxo básico ----------

describe('lance aceito', () => {
  it('primeiro lance igual ao inicial: grava lance, reserva, líder e cadeia de hashes', async () => {
    const lotId = await createLiveLot();
    const response = await bid(c1, lotId, 10_000);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      bid: { seq: 1, amountCents: 10_000, alias: expect.stringMatching(/^LIC-/) },
      lot: { id: lotId, version: 1, bidCount: 1, currentBidCents: 10_000, nextMinimumBidCents: 11_000, extended: false },
      wallet: { totalCents: 1_000_000, committedCents: 10_000, availableCents: 990_000 },
      audit: { status: 'pending' },
    });

    const state = await lotState(lotId);
    expect(state).toMatchObject({ bid_count: 1, leader_email: 'cliente1@example.com' });
    expect(state.reservations).toEqual([{ email: 'cliente1@example.com', amount_cents: 10_000 }]);

    // A cadeia é real: o hash gravado é o recalculado a partir do conteúdo.
    const stored = (await pool.query('SELECT * FROM bids WHERE lot_id = $1', [lotId])).rows[0];
    const genesis = await lotGenesis(lotId);
    expect(stored.prev_hash).toBe(genesis);
    expect(stored.bidder_ref).toBe(bidderRef(await userId('cliente1@example.com'), lotId));
    expect(stored.hash).toBe(
      bidHash(genesis, {
        lotId,
        seq: 1,
        bidId: stored.id,
        bidderRef: stored.bidder_ref,
        alias: stored.public_alias,
        amountCents: stored.amount_cents,
        acceptedAt: stored.accepted_at,
      }),
    );
  });

  it('exemplo do guia: A lidera com R$ 100, B cobre com R$ 120, a reserva de A é liberada na hora', async () => {
    const a = await registerBidder('a@example.com', 100_000);
    const b = await registerBidder('b@example.com', 100_000);
    const lotId = await createLiveLot({ starting: 10_000, increment: 2_000 });

    expect((await bid(a, lotId, 10_000)).status).toBe(201);
    expect(await wallet('a@example.com')).toEqual({ total: 100_000, committed: 10_000, available: 90_000 });
    expect(await wallet('b@example.com')).toEqual({ total: 100_000, committed: 0, available: 100_000 });

    expect((await bid(b, lotId, 12_000)).status).toBe(201);
    expect(await wallet('a@example.com')).toEqual({ total: 100_000, committed: 0, available: 100_000 });
    expect(await wallet('b@example.com')).toEqual({ total: 100_000, committed: 12_000, available: 88_000 });

    const state = await lotState(lotId);
    expect(state.reservations).toEqual([{ email: 'b@example.com', amount_cents: 12_000 }]);
    expectChainIsValid(lotId, state.bids, await lotGenesis(lotId));
  });

  it('histórico público mostra pseudônimos, valores e horários, sem ids ou emails', async () => {
    const lotId = await createLiveLot();
    await bid(c1, lotId, 10_000);
    await bid(c2, lotId, 11_000);

    const response = await request(app).get(`/api/lots/${lotId}/bids`);
    expect(response.status).toBe(200);
    expect(response.body.bids.map((b: { seq: number; amountCents: number }) => [b.seq, b.amountCents])).toEqual([
      [2, 11_000],
      [1, 10_000],
    ]);
    expect(JSON.stringify(response.body)).not.toMatch(/@|bidder_id|bidderId|bidder_ref|[0-9a-f]{8}-[0-9a-f]{4}-/);

    const detail = await request(app).get(`/api/lots/${lotId}`);
    expect(detail.body.lot).toMatchObject({ bidCount: 2, currentBidCents: 11_000, leaderAlias: expect.stringMatching(/^LIC-/) });
  });
});

// ---------- recusas ----------

describe('recusas não alteram nada', () => {
  it.each([
    ['abaixo do inicial', async () => ({ lotId: await createLiveLot(), amount: 9_999 }), 'BID_BELOW_MINIMUM'],
    ['lote ainda não iniciado', async () => ({ lotId: await createLiveLot({ startsInMs: 60_000 }), amount: 10_000 }), 'LOT_NOT_STARTED'],
    [
      'lote encerrado',
      async () => ({ lotId: await createLiveLot({ startsInMs: -7_200_000, endsInMs: -1 }), amount: 10_000 }),
      'LOT_ENDED',
    ],
    [
      'lote cancelado',
      async () => {
        const lotId = await createLiveLot();
        await pool.query('UPDATE lots SET cancelled_at = now() WHERE id = $1', [lotId]);
        return { lotId, amount: 10_000 };
      },
      'LOT_CANCELLED',
    ],
    ['saldo insuficiente', async () => ({ lotId: await createLiveLot({ starting: 1_000_001 }), amount: 1_000_001 }), 'INSUFFICIENT_FUNDS'],
  ])('%s', async (_label, setup, code) => {
    const { lotId, amount } = await setup();
    const before = await fullSnapshot();
    const response = await bid(c1, lotId, amount);

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe(code);
    expect(response.body.error.details.serverTime).toEqual(expect.any(String));
    expect(await fullSnapshot()).toBe(before);
  });

  it('abaixo do mínimo informa o próximo valor aceito', async () => {
    const lotId = await createLiveLot();
    await bid(c1, lotId, 10_000);
    const response = await bid(c2, lotId, 10_500);
    expect(response.body.error).toMatchObject({ code: 'BID_BELOW_MINIMUM', message: 'O lance mínimo agora é R$ 110,00.' });
    expect(response.body.error.details.minNextBidCents).toBe(11_000);
  });

  it('líder não cobre o próprio lance e nada muda', async () => {
    const lotId = await createLiveLot();
    await bid(c1, lotId, 10_000);
    const before = await fullSnapshot();

    const response = await bid(c1, lotId, 50_000);
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('ALREADY_LEADING');
    expect(await fullSnapshot()).toBe(before);
  });

  it('leiloeiro não dá lance (403), visitante 401, lote inexistente 404', async () => {
    const lotId = await createLiveLot();
    expect((await bid(seller, lotId, 10_000)).status).toBe(403);
    expect((await request(app).post(`/api/lots/${lotId}/bids`).set('Idempotency-Key', randomUUID()).send({ amountCents: 10_000 })).status).toBe(401);
    expect((await bid(c1, '00000000-0000-4000-8000-000000000000', 10_000)).status).toBe(404);
  });

  it.each([
    ['decimal', 10_000.5],
    ['negativo', -10_000],
    ['texto', '10000'],
    ['zero', 0],
  ])('valor %s: 400', async (_label, amount) => {
    const lotId = await createLiveLot();
    expect((await bid(c1, lotId, amount)).status).toBe(400);
  });

  it('o cliente não escolhe quem oferta nem o horário: campos extras dão 400', async () => {
    const lotId = await createLiveLot();
    const response = await request(app)
      .post(`/api/lots/${lotId}/bids`)
      .set('Cookie', c1)
      .set('Idempotency-Key', randomUUID())
      .send({ amountCents: 10_000, bidderId: await userId('cliente2@example.com'), acceptedAt: '2020-01-01T00:00:00Z' });
    expect(response.status).toBe(400);
    expect(response.body.error.details.fields._).toMatch(/bidderId|acceptedAt/);
  });
});

// ---------- prorrogação ----------

describe('prorrogação (anti-sniping)', () => {
  it('lance com menos de 120 s restantes: novo fim = aceitação + 120 s, persistido e devolvido', async () => {
    const lotId = await createLiveLot({ endsInMs: 60_000 });
    const response = await bid(c1, lotId, 10_000);

    expect(response.status).toBe(201);
    const acceptedAt = new Date(response.body.bid.acceptedAt).getTime();
    expect(response.body.lot.extended).toBe(true);
    expect(new Date(response.body.lot.endsAt).getTime()).toBe(acceptedAt + 120_000);
    expect((await lotState(lotId)).ends_at.getTime()).toBe(acceptedAt + 120_000);
  });

  it('lance com mais de 120 s restantes: fim não muda, nem nos microssegundos', async () => {
    // Regressão: o lote é criado com now() (microssegundos). Antes da correção, o fim era
    // regravado a partir do JavaScript (milissegundos), ficava menor que o original e o
    // banco recusava com lots_end_never_before_original (erro 500).
    const lotId = await createLiveLot({ endsInMs: 600_000 });
    const response = await bid(c1, lotId, 10_000);

    expect(response.status).toBe(201);
    expect(response.body.lot.extended).toBe(false);
    const unchanged = await pool.query<{ same: boolean }>('SELECT ends_at = original_ends_at AS same FROM lots WHERE id = $1', [lotId]);
    expect(unchanged.rows[0].same).toBe(true);
  });
});

// ---------- idempotência ----------

describe('idempotência do lance', () => {
  it('repetir o pedido devolve a mesma resposta sem novo lance; outro valor com a mesma chave: 409', async () => {
    const lotId = await createLiveLot();
    const first = await bid(c1, lotId, 10_000, 'lance-repetido-01');
    const again = await bid(c1, lotId, 10_000, 'lance-repetido-01');

    expect(again.status).toBe(201);
    expect(again.headers['idempotent-replayed']).toBe('true');
    expect(again.body).toEqual(first.body);
    expect((await lotState(lotId)).bids).toHaveLength(1);

    const other = await bid(c1, lotId, 12_000, 'lance-repetido-01');
    expect(other.status).toBe(409);
    expect(other.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('4 pedidos simultâneos com a mesma chave geram um único lance', async () => {
    const lotId = await createLiveLot();
    const holder = await holdLotLock(lotId);
    const responses = await raceUnderLock(
      holder,
      Array.from({ length: 4 }, () => () => bid(c1, lotId, 10_000, 'lance-simultaneo-01')),
      1, // só o primeiro chega a esperar o lote; os outros esperam a chave
    );

    expect(responses.map((r) => r.status)).toEqual([201, 201, 201, 201]);
    expect(new Set(responses.map((r) => JSON.stringify(r.body))).size).toBe(1);
    expect((await lotState(lotId)).bids).toHaveLength(1);
    expect(await wallet('cliente1@example.com')).toMatchObject({ committed: 10_000 });
  });
});

// ---------- concorrência ----------

describe('concorrência (resultado permitido de cada disputa)', () => {
  it('duas ofertas iguais simultâneas: exatamente uma vence; a outra fica abaixo do novo mínimo', async () => {
    for (let round = 0; round < 3; round++) {
      const lotId = await createLiveLot();
      const holder = await holdLotLock(lotId);
      const responses = await raceUnderLock(holder, [() => bid(c1, lotId, 10_000), () => bid(c2, lotId, 10_000)]);

      const statuses = responses.map((r) => r.status).sort();
      expect(statuses).toEqual([201, 422]);
      expect(responses.find((r) => r.status === 422)!.body.error.code).toBe('BID_BELOW_MINIMUM');

      const state = await lotState(lotId);
      const winner = responses[0].status === 201 ? 'cliente1@example.com' : 'cliente2@example.com';
      expect(state).toMatchObject({ bid_count: 1, leader_email: winner });
      expect(state.reservations).toEqual([{ email: winner, amount_cents: 10_000 }]);
    }
  });

  it('ofertas diferentes simultâneas: só ordens válidas; líder é sempre o maior lance aceito', async () => {
    for (let round = 0; round < 4; round++) {
      const lotId = await createLiveLot();
      const holder = await holdLotLock(lotId);
      const [low, high] = await raceUnderLock(holder, [() => bid(c1, lotId, 10_000), () => bid(c2, lotId, 15_000)]);

      // Permitido: (10.000 e depois 15.000: os dois aceitos) ou (15.000 primeiro: 10.000 recusado).
      expect(high.status).toBe(201);
      expect([201, 422]).toContain(low.status);
      if (low.status === 422) expect(low.body.error.code).toBe('BID_BELOW_MINIMUM');

      const state = await lotState(lotId);
      expect(state.leader_email).toBe('cliente2@example.com');
      expect(state.reservations).toEqual([{ email: 'cliente2@example.com', amount_cents: 15_000 }]);
      expect(state.bid_count).toBe(low.status === 201 ? 2 : 1);
      const amounts = state.bids.map((b) => b.amount_cents);
      expect([...amounts].sort((x, y) => x - y)).toEqual(amounts); // sempre crescente
      expectChainIsValid(lotId, state.bids, await lotGenesis(lotId));
      expect(await wallet('cliente1@example.com')).toMatchObject({ committed: 0 });
    }
  });

  it('mesmo cliente em dois lotes sem saldo para os dois: só um lance é aceito', async () => {
    for (let round = 0; round < 3; round++) {
      const email = `duplo${round}@example.com`;
      const cookie = await registerBidder(email, 10_000); // R$ 100,00
      const lotA = await createLiveLot({ starting: 7_000 });
      const lotB = await createLiveLot({ starting: 7_000 });

      // Segura a carteira: os dois lances (em lotes diferentes) param nela.
      const holder = await holdLock('SELECT user_id FROM wallets WHERE user_id = $1 FOR UPDATE', [await userId(email)]);
      const responses = await raceUnderLock(holder, [() => bid(cookie, lotA, 7_000), () => bid(cookie, lotB, 7_000)]);

      expect(responses.map((r) => r.status).sort()).toEqual([201, 422]);
      expect(responses.find((r) => r.status === 422)!.body.error.code).toBe('INSUFFICIENT_FUNDS');
      expect(await wallet(email)).toEqual({ total: 10_000, committed: 7_000, available: 3_000 });
    }
  });

  it('líder mandando dois lances ao mesmo tempo: só o primeiro entra', async () => {
    const lotId = await createLiveLot();
    const holder = await holdLotLock(lotId);
    const responses = await raceUnderLock(holder, [() => bid(c1, lotId, 10_000), () => bid(c1, lotId, 20_000)]);

    expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
    const rejected = responses.find((r) => r.status === 422)!;
    expect(['ALREADY_LEADING', 'BID_BELOW_MINIMUM']).toContain(rejected.body.error.code);
    expect((await lotState(lotId)).bids).toHaveLength(1);
  });

  it('lances cruzados em dois lotes trocando liderança não travam (carteiras bloqueadas em ordem)', async () => {
    const lotA = await createLiveLot();
    const lotB = await createLiveLot();
    await bid(c1, lotA, 10_000); // c1 lidera A
    await bid(c2, lotB, 10_000); // c2 lidera B

    const holderA = await holdLotLock(lotA);
    const holderB = await holdLotLock(lotB);
    const promises = [Promise.resolve(bid(c2, lotA, 11_000)), Promise.resolve(bid(c1, lotB, 11_000))];
    try {
      await waitForLockWaiters(2);
    } finally {
      await holderA.release();
      await holderB.release();
    }
    const responses = await Promise.all(promises);

    expect(responses.map((r) => r.status)).toEqual([201, 201]);
    expect(await wallet('cliente1@example.com')).toMatchObject({ committed: 11_000 });
    expect(await wallet('cliente2@example.com')).toMatchObject({ committed: 11_000 });
  });

  it('lance enviado antes do fim, mas que só obtém o bloqueio depois do fim, é recusado', async () => {
    const lotId = await createLiveLot({ endsInMs: 1_500 });
    const holder = await holdLotLock(lotId);
    const before = await fullSnapshot();

    const pending = Promise.resolve(bid(c1, lotId, 10_000)); // enviado com o lote ainda aberto
    try {
      await waitForLockWaiters(1);
      const endsAt = (await pool.query<{ ends_at: Date }>('SELECT ends_at FROM lots WHERE id = $1', [lotId])).rows[0].ends_at;
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, endsAt.getTime() - Date.now()) + 300));
    } finally {
      await holder.release();
    }

    const response = await pending;
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('LOT_ENDED');
    expect(await fullSnapshot()).toBe(before);
  });

  it('o mesmo cenário, liberado antes do fim, aceita e prorroga', async () => {
    const lotId = await createLiveLot({ endsInMs: 5_000 });
    const holder = await holdLotLock(lotId);
    const [response] = await raceUnderLock(holder, [() => bid(c1, lotId, 10_000)]);
    expect(response.status).toBe(201);
    expect(response.body.lot.extended).toBe(true);
  });

  it('cancelamento e primeiro lance simultâneos: sempre exatamente um vence', async () => {
    for (let round = 0; round < 4; round++) {
      const lotId = await createLiveLot();
      const holder = await holdLotLock(lotId);
      const [cancel, placed] = await raceUnderLock(holder, [
        () => request(app).post(`/api/lots/${lotId}/cancel`).set('Cookie', seller),
        () => bid(c1, lotId, 10_000),
      ]);

      const state = await lotState(lotId);
      if (cancel.status === 200) {
        expect(placed.status).toBe(422);
        expect(placed.body.error.code).toBe('LOT_CANCELLED');
        expect(state).toMatchObject({ bid_count: 0, leader_email: null });
        expect(state.cancelled_at).not.toBeNull();
      } else {
        expect(cancel.status).toBe(409);
        expect(cancel.body.error.code).toBe('LOT_HAS_BIDS');
        expect(placed.status).toBe(201);
        expect(state).toMatchObject({ bid_count: 1, cancelled_at: null });
      }
    }
  });
});

// ---------- eventos ----------

describe('eventos depois do commit', () => {
  it('publica bid.accepted só depois do COMMIT; recusa e repetição não publicam', async () => {
    const lotId = await createLiveLot({ endsInMs: 60_000 });
    const seen: { event: BidAcceptedEvent; visibleInDatabase: boolean }[] = [];
    const checks: Promise<void>[] = [];
    const stop = onBidAccepted((event) => {
      // Outra conexão só enxerga o lance se a transação já foi confirmada.
      checks.push(
        pool.query('SELECT 1 FROM bids WHERE lot_id = $1 AND seq = $2', [event.lotId, event.seq]).then((result) => {
          seen.push({ event, visibleInDatabase: result.rowCount === 1 });
        }),
      );
    });

    try {
      await bid(c1, lotId, 10_000, 'evento-01');
      await bid(c1, lotId, 10_000, 'evento-01'); // repetição
      await bid(c2, lotId, 10_500); // recusado
      await Promise.all(checks);
    } finally {
      stop();
    }

    expect(seen).toHaveLength(1);
    expect(seen[0].visibleInDatabase).toBe(true);
    // Com a âncora de teste no ar, o checkpoint é confirmado depois do commit e antes do evento.
    expect(seen[0].event).toMatchObject({ lotId, seq: 1, amountCents: 10_000, extended: true, auditStatus: 'confirmed' });
  });
});
