// Liquidação automática (etapa 11) com PostgreSQL e âncora de teste reais. O relógio é injetado:
// os testes "pulam" para depois do fim sem esperar. Nas corridas, uma transação externa segura o
// bloqueio do lote e só libera quando o banco mostra todos os concorrentes parados nele.
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runSeed } from '../src/db/seed-data.js';
import type { AuditService } from '../src/modules/audit/service.js';
import { registerUser } from '../src/modules/auth/service.js';
import { placeBid, type Clock } from '../src/modules/bids/service.js';
import { onLotClosed, type LotClosedEvent } from '../src/modules/realtime/events.js';
import { createSettlementJob } from '../src/modules/settlement/job.js';
import { settleLot } from '../src/modules/settlement/service.js';
import { createTestApp, createTestAudit, createTestPool, resetDatabase, sessionCookie, unreachableAnchor } from './helpers.js';

const pool = createTestPool(12);
let app: ReturnType<typeof createTestApp>;
let audit: AuditService;
let sellerId: string;
let closedEvents: LotClosedEvent[] = [];
let stopListening: () => void = () => {};

// ---------- auxiliares ----------

/** Relógio fixo: o "agora" que o serviço vê depois dos bloqueios. */
const clockAt =
  (date: Date): Clock =>
  async () =>
    date;
const plusMs = (date: Date, ms: number) => new Date(date.getTime() + ms);

async function createBidder(email: string, balanceCents: number) {
  const { user } = await registerUser(pool, { email, password: 'senha-forte-123', role: 'bidder' });
  if (balanceCents > 0) {
    await pool.query(
      `INSERT INTO wallet_entries (user_id, kind, amount_cents, operation_key) VALUES ($1, 'deposit', $2, $3)`,
      [user.id, balanceCents, `teste:${email}`],
    );
    await pool.query('UPDATE wallets SET total_cents = $2 WHERE user_id = $1', [user.id, balanceCents]);
  }
  return user;
}

/**
 * Lote ao vivo, direto no banco, com horários em milissegundos (como o seed). Termina em 10 min por
 * padrão: lance com até 2 min restantes prorrogaria o fim (regra anti-sniping).
 */
async function createLot(options: { starting?: number; increment?: number; endsInMs?: number; startedMsAgo?: number } = {}) {
  const result = await pool.query<{ id: string; ends_at: Date }>(
    `INSERT INTO lots (seller_id, snapshot_id, starting_bid_cents, min_increment_cents, starts_at, original_ends_at, ends_at)
     SELECT $1, (SELECT id FROM item_snapshots LIMIT 1), $2, $3,
            date_trunc('milliseconds', now()) - $5 * interval '1 millisecond',
            date_trunc('milliseconds', now()) + $4 * interval '1 millisecond',
            date_trunc('milliseconds', now()) + $4 * interval '1 millisecond'
     RETURNING id, ends_at`,
    [sellerId, options.starting ?? 10_000, options.increment ?? 1_000, options.endsInMs ?? 600_000, options.startedMsAgo ?? 60_000],
  );
  return result.rows[0];
}

/** Lance pelo serviço real (mesma transação da rota), com relógio opcional. */
function bid(lotId: string, bidderId: string, amountCents: number, options: { clock?: Clock; recorderAudit?: AuditService } = {}) {
  return placeBid(
    pool,
    { lotId, bidderId, amountCents, idempotencyKey: randomUUID() },
    { integrity: (options.recorderAudit ?? audit).recorder, clock: options.clock },
  );
}

async function wallet(userId: string) {
  const { rows } = await pool.query<{ total: number; committed: number }>(
    `SELECT w.total_cents AS total,
            (SELECT coalesce(sum(amount_cents), 0)::bigint FROM reservations r WHERE r.bidder_id = w.user_id) AS committed
       FROM wallets w WHERE w.user_id = $1`,
    [userId],
  );
  return { total: rows[0].total, committed: rows[0].committed, available: rows[0].total - rows[0].committed };
}

async function lotEnd(lotId: string) {
  return (await pool.query<{ ends_at: Date }>('SELECT ends_at FROM lots WHERE id = $1', [lotId])).rows[0].ends_at;
}

/** Tudo que a liquidação poderia mudar. Usado para provar que nada mudou. */
async function financialSnapshot() {
  const tables = ['lots', 'bids', 'reservations', 'wallets', 'wallet_entries', 'settlements', 'receipts'];
  const parts: Record<string, unknown> = {};
  for (const table of tables) parts[table] = (await pool.query(`SELECT * FROM ${table} ORDER BY 1`)).rows;
  return JSON.stringify(parts);
}

async function counts(lotId: string) {
  const { rows } = await pool.query<{ settlements: number; receipts: number; entries: number }>(
    `SELECT (SELECT count(*) FROM settlements WHERE lot_id = $1) AS settlements,
            (SELECT count(*) FROM receipts WHERE lot_id = $1) AS receipts,
            (SELECT count(*) FROM wallet_entries WHERE lot_id = $1) AS entries`,
    [lotId],
  );
  return rows[0];
}

async function issue(lotId: string) {
  return (
    await pool.query<{ status: string; reason: string; attempts: number }>(
      'SELECT status, reason, attempts FROM settlement_issues WHERE lot_id = $1',
      [lotId],
    )
  ).rows[0];
}

async function holdLotLock(lotId: string): Promise<{ client: PoolClient; release: () => Promise<void> }> {
  const client = await pool.connect();
  await client.query('BEGIN');
  await client.query('SELECT id FROM lots WHERE id = $1 FOR UPDATE', [lotId]);
  return {
    client,
    release: async () => {
      await client.query('COMMIT');
      client.release();
    },
  };
}

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
  throw new Error(`Esperava ${count} operações aguardando bloqueio.`);
}

async function login(email: string, password: string) {
  return sessionCookie(await request(app).post('/api/auth/login').send({ email, password }));
}

beforeEach(async () => {
  await resetDatabase(pool);
  await runSeed(pool);
  audit = createTestAudit(pool);
  app = createTestApp(pool, { audit });
  sellerId = (await pool.query<{ id: string }>("SELECT id FROM users WHERE email = 'leiloeiro@example.com'")).rows[0].id;
  closedEvents = [];
  stopListening = onLotClosed((event) => closedEvents.push(event));
});

afterEach(() => stopListening());

afterAll(async () => {
  await pool.end();
});

// ---------- fechamento normal e exemplo do guia ----------

describe('fechamento normal', () => {
  it('exemplo do guia: A e B com R$ 1.000, B vence com R$ 120; totais finais conferem', async () => {
    const a = await createBidder('a@example.com', 100_000);
    const b = await createBidder('b@example.com', 100_000);
    const lot = await createLot({ starting: 10_000, increment: 2_000 });

    await bid(lot.id, a.id, 10_000); // A lidera com R$ 100
    expect(await wallet(a.id)).toEqual({ total: 100_000, committed: 10_000, available: 90_000 });
    await bid(lot.id, b.id, 12_000); // B cobre com R$ 120 e a reserva de A é liberada
    expect(await wallet(a.id)).toEqual({ total: 100_000, committed: 0, available: 100_000 });
    expect(await wallet(b.id)).toEqual({ total: 100_000, committed: 12_000, available: 88_000 });
    expect(await wallet(sellerId)).toEqual({ total: 0, committed: 0, available: 0 });

    const job = createSettlementJob({ pool, audit, clock: clockAt(plusMs(lot.ends_at, 1)) });
    const summary = await job.runOnce();
    expect(summary).toEqual({ checked: 1, settled: 1, blocked: 0, failed: 0 });

    // Tabela do guia: A 1.000 / 0 / 1.000; B 880 / 0 / 880; vendedor recebe 120 na liquidação.
    expect(await wallet(a.id)).toEqual({ total: 100_000, committed: 0, available: 100_000 });
    expect(await wallet(b.id)).toEqual({ total: 88_000, committed: 0, available: 88_000 });
    expect(await wallet(sellerId)).toEqual({ total: 12_000, committed: 0, available: 12_000 });

    const entries = await pool.query<{ user_id: string; kind: string; amount_cents: number; operation_key: string }>(
      'SELECT user_id, kind, amount_cents, operation_key FROM wallet_entries WHERE lot_id = $1 ORDER BY kind',
      [lot.id],
    );
    expect(entries.rows).toEqual([
      { user_id: sellerId, kind: 'settlement_credit', amount_cents: 12_000, operation_key: `settlement:${lot.id}:credit` },
      { user_id: b.id, kind: 'settlement_debit', amount_cents: 12_000, operation_key: `settlement:${lot.id}:debit` },
    ]);
    const settlement = (
      await pool.query<{ winner_id: string; amount_cents: number; settled_at: Date }>(
        'SELECT winner_id, amount_cents, settled_at FROM settlements WHERE lot_id = $1',
        [lot.id],
      )
    ).rows[0];
    expect(settlement).toEqual({ winner_id: b.id, amount_cents: 12_000, settled_at: plusMs(lot.ends_at, 1) });
    expect(await counts(lot.id)).toEqual({ settlements: 1, receipts: 1, entries: 2 });
    expect((await pool.query('SELECT 1 FROM reservations WHERE lot_id = $1', [lot.id])).rowCount).toBe(0);

    // Estado público e resumo do vendedor a partir dos dados reais.
    const publicLot = (await request(app).get(`/api/lots/${lot.id}`)).body.lot;
    expect(publicLot.settled).toBe(true);
    expect(publicLot.result).toEqual({ winnerAlias: b.publicAlias, finalAmountCents: 12_000 });
    const sellerCookie = await login('leiloeiro@example.com', 'leilao-demo-2026');
    const summaryResponse = await request(app).get('/api/seller/summary').set('Cookie', sellerCookie);
    expect(summaryResponse.body.summary).toMatchObject({ totalReceivedCents: 12_000, soldLots: 1, settlementBlocked: 0 });

    // Evento só depois do commit, uma vez.
    expect(closedEvents).toHaveLength(1);
    expect(closedEvents[0]).toMatchObject({
      lotId: lot.id,
      winnerAlias: b.publicAlias,
      finalAmountCents: 12_000,
      winnerId: b.id,
      sellerId,
    });
    expect(closedEvents[0].receiptToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('sem lances: encerra sem vencedor, sem cobrança e sem comprovante', async () => {
    const lot = await createLot();
    const before = await wallet(sellerId);

    const outcome = await settleLot(pool, lot.id, { audit, clock: clockAt(plusMs(lot.ends_at, 1)) });

    expect(outcome).toEqual({ lotId: lot.id, result: 'settled', winnerAlias: null, amountCents: null, receiptToken: null });
    const settlement = (await pool.query('SELECT winner_id, winning_bid_id, amount_cents FROM settlements WHERE lot_id = $1', [lot.id]))
      .rows[0];
    expect(settlement).toEqual({ winner_id: null, winning_bid_id: null, amount_cents: null });
    expect(await counts(lot.id)).toEqual({ settlements: 1, receipts: 0, entries: 0 });
    expect(await wallet(sellerId)).toEqual(before);
    const publicLot = (await request(app).get(`/api/lots/${lot.id}`)).body.lot;
    expect(publicLot.result).toEqual({ winnerAlias: null, finalAmountCents: null });
    expect(closedEvents).toHaveLength(1);
    expect(closedEvents[0]).toMatchObject({ winnerAlias: null, finalAmountCents: null, winnerId: null, receiptToken: null });
  });

  it('fim exclusivo: 1 ms antes do fim não liquida; exatamente no fim liquida', async () => {
    const lot = await createLot();

    const early = createSettlementJob({ pool, audit, clock: clockAt(plusMs(lot.ends_at, -1)) });
    expect(await early.findDueLots()).not.toContain(lot.id);
    expect(await settleLot(pool, lot.id, { audit, clock: clockAt(plusMs(lot.ends_at, -1)) })).toEqual({
      lotId: lot.id,
      result: 'not_due',
    });
    expect(await counts(lot.id)).toMatchObject({ settlements: 0 });

    const atEnd = createSettlementJob({ pool, audit, clock: clockAt(lot.ends_at) });
    expect(await atEnd.findDueLots()).toContain(lot.id);
    expect(await atEnd.runOnce()).toMatchObject({ settled: 1 });
  });

  it('lote cancelado não é liquidado', async () => {
    const lot = await createLot();
    await pool.query('UPDATE lots SET cancelled_at = now() WHERE id = $1', [lot.id]);
    const job = createSettlementJob({ pool, audit, clock: clockAt(plusMs(lot.ends_at, 1)) });
    expect(await job.findDueLots()).not.toContain(lot.id);
    expect(await settleLot(pool, lot.id, { audit, clock: clockAt(plusMs(lot.ends_at, 1)) })).toEqual({
      lotId: lot.id,
      result: 'cancelled',
    });
    expect(await counts(lot.id)).toMatchObject({ settlements: 0 });
  });
});

// ---------- idempotência e concorrência ----------

describe('repetição e concorrência', () => {
  it('repetir o job ou chamar a liquidação de novo não duplica nada', async () => {
    const a = await createBidder('a@example.com', 100_000);
    const lot = await createLot();
    await bid(lot.id, a.id, 50_000);
    const clock = clockAt(plusMs(lot.ends_at, 1));
    const job = createSettlementJob({ pool, audit, clock });

    expect(await job.runOnce()).toMatchObject({ settled: 1 });
    const after = await financialSnapshot();
    expect(await job.runOnce()).toEqual({ checked: 0, settled: 0, blocked: 0, failed: 0 });
    expect(await settleLot(pool, lot.id, { audit, clock })).toEqual({ lotId: lot.id, result: 'already_settled' });

    expect(await financialSnapshot()).toBe(after);
    expect(await counts(lot.id)).toEqual({ settlements: 1, receipts: 1, entries: 2 });
    expect(await wallet(a.id)).toEqual({ total: 50_000, committed: 0, available: 50_000 });
    expect(closedEvents).toHaveLength(1);
  });

  it('dois executores ao mesmo tempo (dois servidores): uma única liquidação', async () => {
    const a = await createBidder('a@example.com', 100_000);
    const lot = await createLot();
    await bid(lot.id, a.id, 30_000);
    const clock = clockAt(plusMs(lot.ends_at, 1));
    const jobA = createSettlementJob({ pool, audit, clock });
    const jobB = createSettlementJob({ pool, audit, clock });

    const holder = await holdLotLock(lot.id);
    const runs = [jobA.runOnce(), jobB.runOnce()];
    try {
      await waitForLockWaiters(2);
    } finally {
      await holder.release();
    }
    const results = await Promise.all(runs);

    expect(results.reduce((total, summary) => total + summary.settled, 0)).toBe(1);
    expect(results.reduce((total, summary) => total + summary.failed, 0)).toBe(0);
    expect(await counts(lot.id)).toEqual({ settlements: 1, receipts: 1, entries: 2 });
    expect(await wallet(a.id)).toEqual({ total: 70_000, committed: 0, available: 70_000 });
    expect(await wallet(sellerId)).toEqual({ total: 30_000, committed: 0, available: 30_000 });
    expect(closedEvents).toHaveLength(1);
  });

  it('último lance chega antes da liquidação: prorroga, e a liquidação respeita o novo fim', async () => {
    const a = await createBidder('a@example.com', 100_000);
    const b = await createBidder('b@example.com', 100_000);
    const lot = await createLot();
    await bid(lot.id, a.id, 10_000);

    // Fila no bloqueio: primeiro o lance (1 ms antes do fim), depois a liquidação (1 ms depois).
    const holder = await holdLotLock(lot.id);
    let lastBid: Promise<Awaited<ReturnType<typeof bid>>>;
    let settlement: Promise<Awaited<ReturnType<typeof settleLot>>>;
    try {
      lastBid = bid(lot.id, b.id, 20_000, { clock: clockAt(plusMs(lot.ends_at, -1)) });
      await waitForLockWaiters(1);
      settlement = settleLot(pool, lot.id, { audit, clock: clockAt(plusMs(lot.ends_at, 1)) });
      await waitForLockWaiters(2);
    } finally {
      await holder.release();
    }

    const accepted = await lastBid!;
    expect(accepted.status).toBe(201);
    expect(accepted.body.lot.extended).toBe(true);
    const newEnd = plusMs(lot.ends_at, -1 + 120_000);
    expect(new Date(accepted.body.lot.endsAt)).toEqual(newEnd);
    expect(await settlement!).toEqual({ lotId: lot.id, result: 'not_due' });
    expect(await counts(lot.id)).toMatchObject({ settlements: 0 });
    expect(await lotEnd(lot.id)).toEqual(newEnd);

    // Um ciclo depois do fim ORIGINAL não fecha; depois do NOVO fim, B vence.
    expect(await createSettlementJob({ pool, audit, clock: clockAt(plusMs(lot.ends_at, 60_000)) }).findDueLots()).not.toContain(lot.id);
    const outcome = await settleLot(pool, lot.id, { audit, clock: clockAt(plusMs(newEnd, 1)) });
    expect(outcome).toMatchObject({ result: 'settled', winnerAlias: b.publicAlias, amountCents: 20_000 });
    expect(await wallet(b.id)).toEqual({ total: 80_000, committed: 0, available: 80_000 });
    expect(await wallet(a.id)).toEqual({ total: 100_000, committed: 0, available: 100_000 });
  });

  it('liquidação chega antes do último lance: lote fecha e o lance é recusado sem mudar nada', async () => {
    const a = await createBidder('a@example.com', 100_000);
    const b = await createBidder('b@example.com', 100_000);
    const lot = await createLot();
    await bid(lot.id, a.id, 10_000);

    const holder = await holdLotLock(lot.id);
    let settlement: Promise<Awaited<ReturnType<typeof settleLot>>>;
    let lateBid: Promise<unknown>;
    try {
      settlement = settleLot(pool, lot.id, { audit, clock: clockAt(plusMs(lot.ends_at, 1)) });
      await waitForLockWaiters(1);
      lateBid = bid(lot.id, b.id, 20_000, { clock: clockAt(plusMs(lot.ends_at, 2)) }).catch((error: unknown) => error);
      await waitForLockWaiters(2);
    } finally {
      await holder.release();
    }

    expect(await settlement!).toMatchObject({ result: 'settled', winnerAlias: a.publicAlias, amountCents: 10_000 });
    expect(await lateBid!).toMatchObject({ status: 422, code: 'LOT_ENDED' });
    const after = await financialSnapshot();

    // Defesa extra: mesmo com um relógio "antes do fim", lote liquidado não aceita lance.
    await expect(bid(lot.id, b.id, 30_000, { clock: clockAt(plusMs(lot.ends_at, -1_000)) })).rejects.toMatchObject({
      code: 'LOT_ENDED',
    });
    expect(await financialSnapshot()).toBe(after);
    expect(await wallet(b.id)).toEqual({ total: 100_000, committed: 0, available: 100_000 });
  });
});

// ---------- falha parcial e reinício ----------

describe('falha parcial e recuperação', () => {
  it('falha no meio da transação desfaz tudo; o próximo ciclo (após reinício) liquida uma vez', async () => {
    const a = await createBidder('a@example.com', 100_000);
    const lot = await createLot();
    await bid(lot.id, a.id, 25_000);
    const clock = clockAt(plusMs(lot.ends_at, 1));
    const before = await financialSnapshot();

    // Falha simulada SÓ no banco de teste: o comprovante é a última escrita, depois do débito,
    // do crédito, dos lançamentos e da liquidação.
    await pool.query(`CREATE FUNCTION test_falha_comprovante() RETURNS trigger LANGUAGE plpgsql AS $$
                        BEGIN RAISE EXCEPTION 'falha simulada no comprovante'; END $$`);
    await pool.query(
      'CREATE TRIGGER test_falha_comprovante BEFORE INSERT ON receipts FOR EACH ROW EXECUTE FUNCTION test_falha_comprovante()',
    );
    try {
      const summary = await createSettlementJob({ pool, audit, clock }).runOnce();
      expect(summary).toEqual({ checked: 1, settled: 0, blocked: 0, failed: 1 });
    } finally {
      await pool.query('DROP TRIGGER IF EXISTS test_falha_comprovante ON receipts');
      await pool.query('DROP FUNCTION IF EXISTS test_falha_comprovante()');
    }

    expect(await financialSnapshot()).toBe(before); // nada parcial ficou gravado
    expect(await issue(lot.id)).toMatchObject({ status: 'failed', attempts: 1 });
    expect((await issue(lot.id)).reason).not.toContain('falha simulada'); // detalhe técnico só no log
    expect(closedEvents).toHaveLength(0);

    // "Reinício": outro executor, novo ciclo. Liquida uma vez e apaga a pendência.
    expect(await createSettlementJob({ pool, audit, clock }).runOnce()).toMatchObject({ settled: 1, failed: 0 });
    expect(await counts(lot.id)).toEqual({ settlements: 1, receipts: 1, entries: 2 });
    expect(await wallet(a.id)).toEqual({ total: 75_000, committed: 0, available: 75_000 });
    expect(await issue(lot.id)).toBeUndefined();
  });

  it('startup: lote que venceu com o servidor parado é liquidado logo ao iniciar o job', async () => {
    const a = await createBidder('a@example.com', 100_000);
    const lot = await createLot();
    await bid(lot.id, a.id, 40_000);

    // Intervalo longo: só a execução imediata do startup pode liquidar.
    const stop = createSettlementJob({ pool, audit, clock: clockAt(plusMs(lot.ends_at, 3_600_000)) }).start(600_000);
    try {
      const deadline = Date.now() + 10_000;
      while ((await counts(lot.id)).settlements === 0 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    } finally {
      stop();
    }
    expect(await counts(lot.id)).toEqual({ settlements: 1, receipts: 1, entries: 2 });
    expect(await wallet(sellerId)).toEqual({ total: 40_000, committed: 0, available: 40_000 });
  });
});

// ---------- auditoria antes de pagar ----------

describe('auditoria antes de liquidar', () => {
  it('histórico ADULTERADO: não liquida, registra o motivo e não move dinheiro', async () => {
    const a = await createBidder('a@example.com', 100_000);
    const b = await createBidder('b@example.com', 100_000);
    const lot = await createLot();
    await bid(lot.id, a.id, 10_000);
    await bid(lot.id, b.id, 20_000);
    await pool.query('UPDATE bids SET amount_cents = 9000 WHERE lot_id = $1 AND seq = 1', [lot.id]);
    const before = await financialSnapshot();
    const job = createSettlementJob({ pool, audit, clock: clockAt(plusMs(lot.ends_at, 1)) });

    expect(await job.runOnce()).toEqual({ checked: 1, settled: 0, blocked: 1, failed: 0 });
    expect(await job.runOnce()).toMatchObject({ blocked: 1 });

    expect(await financialSnapshot()).toBe(before);
    expect(await issue(lot.id)).toMatchObject({ status: 'tampered', attempts: 2 });
    expect((await issue(lot.id)).reason).toContain('lance 1');
    expect(closedEvents).toHaveLength(0);

    // O leiloeiro vê o estado operacional e o motivo.
    const sellerCookie = await login('leiloeiro@example.com', 'leilao-demo-2026');
    const lots = (await request(app).get('/api/seller/lots').set('Cookie', sellerCookie)).body.lots as {
      id: string;
      settlementIssue: unknown;
    }[];
    expect(lots.find((item) => item.id === lot.id)?.settlementIssue).toMatchObject({
      status: 'tampered',
      statusLabel: 'Não liquidado: auditoria ADULTERADO',
    });
    const summary = (await request(app).get('/api/seller/summary').set('Cookie', sellerCookie)).body.summary;
    expect(summary).toMatchObject({ settlementBlocked: 1, totalReceivedCents: 0 });
  });

  it('âncora fora do ar: VERIFICAÇÃO INDISPONÍVEL não liquida; quando volta, liquida', async () => {
    const a = await createBidder('a@example.com', 100_000);
    const lot = await createLot();
    await bid(lot.id, a.id, 15_000);
    const clock = clockAt(plusMs(lot.ends_at, 1));
    const offline = createTestAudit(pool, { anchor: unreachableAnchor() });

    expect(await createSettlementJob({ pool, audit: offline, clock }).runOnce()).toMatchObject({ blocked: 1, settled: 0 });
    expect(await issue(lot.id)).toMatchObject({ status: 'unavailable' });
    expect(await counts(lot.id)).toMatchObject({ settlements: 0, entries: 0 });

    expect(await createSettlementJob({ pool, audit, clock }).runOnce()).toMatchObject({ settled: 1 });
    expect(await issue(lot.id)).toBeUndefined();
    expect(await wallet(a.id)).toEqual({ total: 85_000, committed: 0, available: 85_000 });
  });

  it('último lance ainda sem confirmação na âncora: espera a reconciliação e só então liquida', async () => {
    const a = await createBidder('a@example.com', 100_000);
    const lot = await createLot();
    // O lance é aceito, mas a âncora estava fora do ar: o checkpoint fica pendente.
    const offline = createTestAudit(pool, { anchor: unreachableAnchor() });
    const accepted = await bid(lot.id, a.id, 15_000, { recorderAudit: offline });
    expect(accepted.body.audit.status).toBe('pending');
    const clock = clockAt(plusMs(lot.ends_at, 1));

    expect(await settleLot(pool, lot.id, { audit, clock })).toMatchObject({ result: 'blocked', status: 'pending' });
    expect(await counts(lot.id)).toMatchObject({ settlements: 0 });

    expect(await audit.reconcilePending()).toMatchObject({ confirmed: 1 });
    expect(await settleLot(pool, lot.id, { audit, clock })).toMatchObject({ result: 'settled', amountCents: 15_000 });
  });
});

// ---------- comprovante e participações ----------

describe('comprovante público e participações', () => {
  async function settledLotWithTwoBidders() {
    const a = await createBidder('a@example.com', 100_000);
    const b = await createBidder('b@example.com', 100_000);
    const lot = await createLot({ starting: 10_000, increment: 2_000 });
    await bid(lot.id, a.id, 10_000);
    await bid(lot.id, b.id, 12_000);
    const outcome = await settleLot(pool, lot.id, { audit, clock: clockAt(plusMs(lot.ends_at, 1)) });
    if (outcome.result !== 'settled' || !outcome.receiptToken) throw new Error('liquidação esperada');
    return { a, b, lot, token: outcome.receiptToken };
  }

  it('comprovante abre sem login, com snapshot do resultado e sem dados pessoais', async () => {
    const { a, b, lot, token } = await settledLotWithTwoBidders();

    const response = await request(app).get(`/api/receipts/${token}`);
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-robots-tag']).toBe('noindex');
    const receipt = response.body.receipt;
    expect(receipt).toMatchObject({
      version: 1,
      lotId: lot.id,
      amountCents: 12_000,
      currency: 'BRL',
      winnerAlias: b.publicAlias,
      settledAt: plusMs(lot.ends_at, 1).toISOString(),
      winningBid: { seq: 2 },
      audit: { bidCount: 2, statusAtSettlement: 'intact' },
    });
    expect(receipt.reference).toMatch(/^LIQ-[0-9A-F]{10}$/);
    expect(receipt.sellerAlias).toMatch(/^VEN-/);
    expect(receipt.item.title).toEqual(expect.any(String));
    expect(receipt.item.provider).toBe('Cleveland Museum of Art');

    // Nenhum email, id de usuário, saldo ou sessão.
    const raw = JSON.stringify(response.body);
    for (const secret of ['@example.com', a.id, b.id, sellerId, 'total', 'balance', 'sid']) {
      expect(raw).not.toContain(secret);
    }

    // O snapshot é imutável: mudar a obra depois não muda o comprovante.
    await pool.query("UPDATE item_snapshots SET title = 'Título alterado depois'");
    expect((await request(app).get(`/api/receipts/${token}`)).body.receipt.item.title).toBe(receipt.item.title);
  });

  it('token inválido ou desconhecido: 404 sem detalhes; lote público não expõe o token', async () => {
    const { lot, token } = await settledLotWithTwoBidders();

    for (const path of ['curto', `${token.slice(0, -1)}!`, 'A'.repeat(43), `${token}x`]) {
      const response = await request(app).get(`/api/receipts/${encodeURIComponent(path)}`);
      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Comprovante não encontrado.' } });
    }
    expect(JSON.stringify((await request(app).get(`/api/lots/${lot.id}`)).body)).not.toContain(token);
    expect(JSON.stringify((await request(app).get('/api/lots')).body)).not.toContain(token);
  });

  it('participações e vitórias: posição, resultado e link do comprovante só para o vencedor', async () => {
    const a = await createBidder('a@example.com', 100_000);
    const b = await createBidder('b@example.com', 100_000);
    const lot = await createLot({ starting: 10_000, increment: 2_000 });
    await bid(lot.id, a.id, 10_000);
    await bid(lot.id, b.id, 12_000);
    const cookieA = await login('a@example.com', 'senha-forte-123');
    const cookieB = await login('b@example.com', 'senha-forte-123');
    const participation = async (cookie: string) => {
      const response = await request(app).get('/api/me/participations').set('Cookie', cookie);
      expect(response.status).toBe(200);
      return response.body;
    };

    // Ao vivo: B lidera, A foi superado.
    expect((await participation(cookieB)).participations[0]).toMatchObject({ outcome: 'leading', position: 1, participantCount: 2 });
    expect((await participation(cookieA)).participations[0]).toMatchObject({
      outcome: 'outbid',
      position: 2,
      myBestBidCents: 10_000,
      myBidCount: 1,
      receiptToken: null,
    });

    // Encerramento com relógio injetado (mudar o fim no banco seria adulterar o histórico).
    const outcome = await settleLot(pool, lot.id, { audit, clock: clockAt(plusMs(lot.ends_at, 1)) });
    if (outcome.result !== 'settled') throw new Error('liquidação esperada');

    const forB = await participation(cookieB);
    expect(forB.summary).toEqual({ total: 1, won: 1, leading: 0 });
    expect(forB.participations[0]).toMatchObject({ outcome: 'won', receiptToken: outcome.receiptToken, myBestBidCents: 12_000 });
    expect(forB.participations[0].lot.result).toEqual({ winnerAlias: b.publicAlias, finalAmountCents: 12_000 });
    const forA = await participation(cookieA);
    expect(forA.summary).toEqual({ total: 1, won: 0, leading: 0 });
    expect(forA.participations[0]).toMatchObject({ outcome: 'lost', receiptToken: null });
    expect(JSON.stringify(forA)).not.toContain(outcome.receiptToken!);

    // Leiloeiro vê o link do comprovante do próprio lote.
    const sellerCookie = await login('leiloeiro@example.com', 'leilao-demo-2026');
    const lots = (await request(app).get('/api/seller/lots').set('Cookie', sellerCookie)).body.lots as {
      id: string;
      receiptToken: string | null;
      settlementIssue: unknown;
    }[];
    expect(lots.find((item) => item.id === lot.id)).toMatchObject({ receiptToken: outcome.receiptToken, settlementIssue: null });
  });

  it('participações: só licitante logado', async () => {
    expect((await request(app).get('/api/me/participations')).status).toBe(401);
    const sellerCookie = await login('leiloeiro@example.com', 'leilao-demo-2026');
    expect((await request(app).get('/api/me/participations').set('Cookie', sellerCookie)).status).toBe(403);
  });

  it('participação encerrada aguardando liquidação', async () => {
    const a = await createBidder('a@example.com', 100_000);
    // Lance dado 5 min antes do fim (relógio injetado): não prorroga, e o lote termina de fato em 1,5 s.
    const lot = await createLot({ endsInMs: 1_500, startedMsAgo: 600_000 });
    await bid(lot.id, a.id, 10_000, { clock: clockAt(plusMs(lot.ends_at, -300_000)) });
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, lot.ends_at.getTime() - Date.now() + 200)));
    const cookieA = await login('a@example.com', 'senha-forte-123');
    const body = (await request(app).get('/api/me/participations').set('Cookie', cookieA)).body;
    expect(body.participations[0]).toMatchObject({ outcome: 'awaiting_settlement', receiptToken: null });
  });
});
