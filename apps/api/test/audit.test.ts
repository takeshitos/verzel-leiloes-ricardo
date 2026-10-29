// Auditoria (R13) com banco principal e âncora de TESTE reais. Os ataques rodam só nos bancos
// isolados *_test. Cada teste dá lances pela API real e depois adultera direto no banco, como
// faria quem tem acesso de escrita ao PostgreSQL (modelo de ameaça em docs/AUDITORIA.md).
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { runSeed } from '../src/db/seed-data.js';
import { bidderRef, bidHash, genesisHash } from '../src/modules/audit/chain.js';
import { checkpointMessage, createKeyring, generateKeyPairBase64 } from '../src/modules/audit/keys.js';
import {
  createTestApp,
  createTestAudit,
  createTestPool,
  resetDatabase,
  sessionCookie,
  testAnchor,
  testKeyring,
  unreachableAnchor,
} from './helpers.js';

const pool = createTestPool(8);
let app: ReturnType<typeof createTestApp>;
let c1: string;
let c2: string;

async function login(email: string) {
  return sessionCookie(await request(app).post('/api/auth/login').send({ email, password: 'leilao-demo-2026' }));
}

async function createLiveLot() {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO lots (seller_id, snapshot_id, starting_bid_cents, min_increment_cents, starts_at, original_ends_at, ends_at)
     SELECT (SELECT id FROM users WHERE email = 'leiloeiro@example.com'), (SELECT id FROM item_snapshots LIMIT 1),
            10000, 1000, now() - interval '1 minute', now() + interval '1 hour', now() + interval '1 hour'
     RETURNING id`,
  );
  return result.rows[0].id;
}

function bid(appToUse: ReturnType<typeof createTestApp>, cookie: string, lotId: string, amountCents: number) {
  return request(appToUse)
    .post(`/api/lots/${lotId}/bids`)
    .set('Cookie', cookie)
    .set('Idempotency-Key', randomUUID())
    .send({ amountCents });
}

/** Lote com 3 lances (10000, 11000, 12000), todos confirmados na âncora. */
async function lotWithThreeBids() {
  const lotId = await createLiveLot();
  expect((await bid(app, c1, lotId, 10_000)).status).toBe(201);
  expect((await bid(app, c2, lotId, 11_000)).status).toBe(201);
  expect((await bid(app, c1, lotId, 12_000)).status).toBe(201);
  return lotId;
}

async function audit(lotId: string, appToUse = app) {
  const response = await request(appToUse).get(`/api/lots/${lotId}/audit`);
  expect(response.status).toBe(200);
  return response.body.audit as { status: string; statusLabel: string; reason: string; bidCount: number; anchoredCount: number; signedCount: number };
}

async function userId(email: string) {
  return (await pool.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [email])).rows[0].id;
}

/** Ataque "recalcular a cadeia": regrava prev_hash e hash de todos os lances com o conteúdo atual. */
async function recomputeChain(lotId: string) {
  const lot = (await pool.query('SELECT * FROM lots WHERE id = $1', [lotId])).rows[0];
  const bids = (await pool.query('SELECT * FROM bids WHERE lot_id = $1 ORDER BY seq', [lotId])).rows;
  let previous = genesisHash({
    lotId,
    sellerId: lot.seller_id,
    snapshotId: lot.snapshot_id,
    startingBidCents: lot.starting_bid_cents,
    minIncrementCents: lot.min_increment_cents,
    startsAt: lot.starts_at,
    originalEndsAt: lot.original_ends_at,
  });
  for (const row of bids) {
    const ref = bidderRef(row.bidder_id, lotId);
    const hash = bidHash(previous, {
      lotId,
      seq: row.seq,
      bidId: row.id,
      bidderRef: ref,
      alias: row.public_alias,
      amountCents: row.amount_cents,
      acceptedAt: row.accepted_at,
    });
    await pool.query('UPDATE bids SET bidder_ref = $2, prev_hash = $3, hash = $4 WHERE id = $1', [row.id, ref, previous, hash]);
    previous = hash;
  }
}

beforeEach(async () => {
  await resetDatabase(pool);
  await runSeed(pool);
  app = createTestApp(pool);
  c1 = await login('cliente1@example.com');
  c2 = await login('cliente2@example.com');
});

afterAll(async () => {
  await pool.end();
});

describe('histórico íntegro', () => {
  it('lances confirmados na âncora: ÍNTEGRO, com histórico completo e sem dados pessoais', async () => {
    const lotId = await lotWithThreeBids();
    const response = await request(app).get(`/api/lots/${lotId}/audit`);

    expect(response.body.audit).toMatchObject({
      status: 'intact',
      statusLabel: 'ÍNTEGRO',
      bidCount: 3,
      signedCount: 3,
      anchoredCount: 3,
    });
    expect(response.body.audit.bids.map((b: { seq: number; amountCents: number }) => [b.seq, b.amountCents])).toEqual([
      [1, 10_000],
      [2, 11_000],
      [3, 12_000],
    ]);
    expect(JSON.stringify(response.body)).not.toMatch(/@|bidder_id|bidderId|password|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"[^,]*"seq/);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('lote sem lances: ÍNTEGRO', async () => {
    expect((await audit(await createLiveLot())).status).toBe('intact');
  });

  it('checkpoint gravado com assinatura Ed25519 e chave pública publicada', async () => {
    const lotId = await lotWithThreeBids();
    const checkpoint = (await pool.query('SELECT * FROM audit_checkpoints WHERE lot_id = $1 AND bid_count = 3', [lotId])).rows[0];
    const message = checkpointMessage({ lotId, bidCount: 3, lastHash: checkpoint.last_hash, keyVersion: 1 });
    expect(testKeyring.verify(message, checkpoint.signature, 1)).toBe(true);
    expect(checkpoint.anchor_status).toBe('confirmed');

    const publicKey = await request(app).get('/api/audit/public-key');
    expect(publicKey.body).toMatchObject({ algorithm: 'Ed25519', keys: [{ keyVersion: 1, publicKeyPem: expect.stringContaining('BEGIN PUBLIC KEY') }] });
    expect(JSON.stringify(publicKey.body)).not.toContain('PRIVATE');
  });
});

describe('adulterações detectadas (ataques no banco de teste)', () => {
  it.each([
    ['alterar o valor de um lance', (lotId: string) => pool.query('UPDATE bids SET amount_cents = 99999 WHERE lot_id = $1 AND seq = 2', [lotId]), /conteúdo do lance 2/],
    ['alterar o horário de um lance', (lotId: string) => pool.query("UPDATE bids SET accepted_at = accepted_at - interval '1 second' WHERE lot_id = $1 AND seq = 1", [lotId]), /conteúdo do lance 1/],
    ['alterar o pseudônimo exibido', (lotId: string) => pool.query("UPDATE bids SET public_alias = 'LIC-FFFFFF' WHERE lot_id = $1 AND seq = 3", [lotId]), /conteúdo do lance 3/],
    [
      'trocar o participante (associação privada)',
      async (lotId: string) => pool.query('UPDATE bids SET bidder_id = $2 WHERE lot_id = $1 AND seq = 1', [lotId, await userId('cliente2@example.com')]),
      /participante do lance 1/,
    ],
    ['alterar o lance inicial do lote (gênese)', (lotId: string) => pool.query('UPDATE lots SET starting_bid_cents = 1 WHERE id = $1', [lotId]), /não se encadeia/],
    ['alterar o término do lote', (lotId: string) => pool.query("UPDATE lots SET ends_at = ends_at + interval '1 day' WHERE id = $1", [lotId]), /término/],
  ])('%s', async (_label, attack, reason) => {
    const lotId = await lotWithThreeBids();
    await attack(lotId);
    const result = await audit(lotId);
    expect(result.status).toBe('tampered');
    expect(result.statusLabel).toBe('ADULTERADO');
    expect(result.reason).toMatch(reason);
  });

  it('recalcular toda a cadeia depois de alterar um valor (o atacante não tem a chave)', async () => {
    const lotId = await lotWithThreeBids();
    await pool.query('UPDATE bids SET amount_cents = 99999 WHERE lot_id = $1 AND seq = 2', [lotId]);
    await recomputeChain(lotId);

    const result = await audit(lotId);
    expect(result.status).toBe('tampered');
    expect(result.reason).toMatch(/checkpoint assinado/);
  });

  it('recalcular a cadeia e apagar todos os checkpoints: a âncora ainda denuncia', async () => {
    const lotId = await lotWithThreeBids();
    await pool.query('UPDATE bids SET amount_cents = 99999 WHERE lot_id = $1 AND seq = 2', [lotId]);
    await recomputeChain(lotId);
    await pool.query('DELETE FROM audit_checkpoints WHERE lot_id = $1', [lotId]);

    const result = await audit(lotId);
    expect(result.status).toBe('tampered');
    expect(result.reason).toMatch(/diverge da âncora/);
  });

  it('remover um lance intermediário', async () => {
    const lotId = await lotWithThreeBids();
    await pool.query('UPDATE lots SET leader_bid_id = NULL, bid_count = 0 WHERE id = $1', [lotId]);
    await pool.query('DELETE FROM reservations WHERE lot_id = $1', [lotId]);
    await pool.query('DELETE FROM bids WHERE lot_id = $1 AND seq = 2', [lotId]);
    expect((await audit(lotId)).status).toBe('tampered');
  });

  it('inserir um lance no meio (renumerando os seguintes)', async () => {
    const lotId = await lotWithThreeBids();
    await pool.query('UPDATE bids SET seq = seq + 10 WHERE lot_id = $1 AND seq >= 2', [lotId]);
    await pool.query('UPDATE bids SET seq = seq - 9 WHERE lot_id = $1 AND seq >= 12', [lotId]);
    await pool.query(
      `INSERT INTO bids (lot_id, seq, bidder_id, public_alias, amount_cents, accepted_at, bidder_ref, prev_hash, hash)
       SELECT $1, 2, bidder_id, public_alias, 10500, accepted_at, bidder_ref, prev_hash, hash FROM bids WHERE lot_id = $1 AND seq = 1`,
      [lotId],
    );
    const result = await audit(lotId);
    expect(result.status).toBe('tampered');
  });

  it('reordenar dois lances', async () => {
    const lotId = await lotWithThreeBids();
    await pool.query('UPDATE bids SET seq = 99 WHERE lot_id = $1 AND seq = 1', [lotId]);
    await pool.query('UPDATE bids SET seq = 1 WHERE lot_id = $1 AND seq = 2', [lotId]);
    await pool.query('UPDATE bids SET seq = 2 WHERE lot_id = $1 AND seq = 99', [lotId]);
    expect((await audit(lotId)).status).toBe('tampered');
  });

  it('remover o último lance de forma "coerente" (lote, reserva e checkpoint também): a âncora denuncia', async () => {
    const lotId = await lotWithThreeBids();
    const second = (await pool.query<{ id: string }>('SELECT id FROM bids WHERE lot_id = $1 AND seq = 2', [lotId])).rows[0].id;
    await pool.query('DELETE FROM reservations WHERE lot_id = $1', [lotId]);
    await pool.query('UPDATE lots SET leader_bid_id = $2, bid_count = 2, ends_at = original_ends_at WHERE id = $1', [lotId, second]);
    await pool.query('DELETE FROM audit_checkpoints WHERE lot_id = $1 AND bid_count = 3', [lotId]);
    await pool.query('DELETE FROM bids WHERE lot_id = $1 AND seq = 3', [lotId]);

    const result = await audit(lotId);
    expect(result.status).toBe('tampered');
    expect(result.reason).toMatch(/âncora registra 3 lance\(s\), mas o banco tem 2/);
  });

  it('remover todo o histórico do lote: a âncora denuncia', async () => {
    const lotId = await lotWithThreeBids();
    await pool.query('DELETE FROM reservations WHERE lot_id = $1', [lotId]);
    await pool.query('UPDATE lots SET leader_bid_id = NULL, bid_count = 0, ends_at = original_ends_at WHERE id = $1', [lotId]);
    await pool.query('DELETE FROM audit_checkpoints WHERE lot_id = $1', [lotId]);
    await pool.query('DELETE FROM bids WHERE lot_id = $1', [lotId]);

    const result = await audit(lotId);
    expect(result.status).toBe('tampered');
    expect(result.reason).toMatch(/âncora registra/);
  });

  it('restaurar o banco a um estado antigo (rollback): a âncora denuncia', async () => {
    const lotId = await createLiveLot();
    await bid(app, c1, lotId, 10_000);
    await bid(app, c2, lotId, 11_000);
    // "Backup" do estado com 2 lances.
    // ends_at como texto: preserva os microssegundos (o JavaScript só guarda milissegundos).
    const lotBackup = (await pool.query('SELECT bid_count, leader_bid_id, ends_at::text AS ends_at, version FROM lots WHERE id = $1', [lotId])).rows[0];
    const reservationBackup = (await pool.query('SELECT * FROM reservations WHERE lot_id = $1', [lotId])).rows[0];

    await bid(app, c1, lotId, 12_000); // terceiro lance, ancorado

    // Restaura o "backup": tira o lance 3 e o checkpoint dele, volta lote e reserva.
    await pool.query('DELETE FROM reservations WHERE lot_id = $1', [lotId]);
    await pool.query('UPDATE lots SET bid_count = $2, leader_bid_id = $3, ends_at = $4::timestamptz, version = $5 WHERE id = $1', [
      lotId,
      lotBackup.bid_count,
      lotBackup.leader_bid_id,
      lotBackup.ends_at,
      lotBackup.version,
    ]);
    await pool.query('DELETE FROM audit_checkpoints WHERE lot_id = $1 AND bid_count = 3', [lotId]);
    await pool.query('DELETE FROM bids WHERE lot_id = $1 AND seq = 3', [lotId]);
    await pool.query('INSERT INTO reservations (lot_id, bidder_id, bid_id, amount_cents) VALUES ($1, $2, $3, $4)', [
      reservationBackup.lot_id,
      reservationBackup.bidder_id,
      reservationBackup.bid_id,
      reservationBackup.amount_cents,
    ]);

    const result = await audit(lotId);
    expect(result.status).toBe('tampered');
    expect(result.reason).toMatch(/restaurado a um estado antigo/);
  });

  it('checkpoint forjado com outra chave', async () => {
    const lotId = await lotWithThreeBids();
    const attackerKey = createKeyring({ privateKeyBase64: generateKeyPairBase64().privateKeyBase64, keyVersion: 1 });
    const checkpoint = (await pool.query('SELECT last_hash FROM audit_checkpoints WHERE lot_id = $1 AND bid_count = 3', [lotId])).rows[0];
    const forged = attackerKey.sign(checkpointMessage({ lotId, bidCount: 3, lastHash: checkpoint.last_hash, keyVersion: 1 }));
    await pool.query('UPDATE audit_checkpoints SET signature = $2 WHERE lot_id = $1 AND bid_count = 3', [lotId, forged]);

    const result = await audit(lotId);
    expect(result.status).toBe('tampered');
    expect(result.reason).toMatch(/assinatura inválida/);
  });

  it('a âncora é só de inserção: UPDATE e DELETE são recusados', async () => {
    await lotWithThreeBids();
    const anchorClient = await import('pg').then(({ default: pg }) => new pg.Client({ connectionString: process.env.TEST_ANCHOR_DATABASE_URL }));
    await anchorClient.connect();
    try {
      await expect(anchorClient.query("UPDATE anchor_entries SET last_hash = repeat('0', 64)")).rejects.toThrow(/somente inserção/);
      await expect(anchorClient.query('DELETE FROM anchor_entries')).rejects.toThrow(/somente inserção/);
    } finally {
      await anchorClient.end();
    }
  });

  it('lote apagado por inteiro: a verificação global aponta o lote ausente', async () => {
    const lotId = await lotWithThreeBids();
    await pool.query('DELETE FROM reservations WHERE lot_id = $1', [lotId]);
    await pool.query('DELETE FROM audit_checkpoints WHERE lot_id = $1', [lotId]);
    await pool.query('UPDATE lots SET leader_bid_id = NULL, bid_count = 0 WHERE id = $1', [lotId]);
    await pool.query('DELETE FROM bids WHERE lot_id = $1', [lotId]);
    await pool.query('DELETE FROM lots WHERE id = $1', [lotId]);

    expect((await request(app).get(`/api/lots/${lotId}/audit`)).status).toBe(404);
    expect(await createTestAudit(pool).findLotsMissingFromDatabase()).toEqual([lotId]);
  });
});

describe('janela entre banco e âncora', () => {
  it('âncora fora do ar no lance: checkpoint fica pendente; com a âncora de volta, PENDENTE; o reconciliador confirma', async () => {
    const offlineApp = createTestApp(pool, { audit: createTestAudit(pool, { anchor: unreachableAnchor() }) });
    const lotId = await createLiveLot();
    const response = await bid(offlineApp, c1, lotId, 10_000);

    expect(response.status).toBe(201); // o lance vale; a auditoria ainda não
    expect(response.body.audit.status).toBe('pending');
    expect((await pool.query('SELECT anchor_status FROM audit_checkpoints WHERE lot_id = $1', [lotId])).rows[0].anchor_status).toBe('pending');

    // Sem âncora alcançável, não se afirma integridade.
    expect((await audit(lotId, offlineApp)).status).toBe('unavailable');
    // Com a âncora no ar, mas o lance ainda não confirmado nela.
    const pending = await audit(lotId);
    expect(pending.status).toBe('pending');
    expect(pending.statusLabel).toBe('VERIFICAÇÃO PENDENTE');

    // "Reinício": um serviço novo reconcilia o que ficou pendente.
    const summary = await createTestAudit(pool).reconcilePending();
    expect(summary).toEqual({ confirmed: 1, stillPending: 0, rejected: 0 });
    expect((await audit(lotId)).status).toBe('intact');
  });

  it('âncora gravou mas a resposta se perdeu: repetir é inofensivo e confirma', async () => {
    const lotId = await createLiveLot();
    const offlineApp = createTestApp(pool, { audit: createTestAudit(pool, { anchor: unreachableAnchor() }) });
    await bid(offlineApp, c1, lotId, 10_000);
    const checkpoint = (await pool.query('SELECT * FROM audit_checkpoints WHERE lot_id = $1', [lotId])).rows[0];

    // Simula: a entrada chegou à âncora, mas o banco principal não soube (segue 'pending').
    expect(
      await testAnchor().append({ lotId, bidCount: 1, lastHash: checkpoint.last_hash, signature: checkpoint.signature, keyVersion: 1 }),
    ).toBe('stored');

    expect(await createTestAudit(pool).reconcilePending()).toEqual({ confirmed: 1, stillPending: 0, rejected: 0 });
    expect((await testAnchor().entriesForLot(lotId)).length).toBe(1); // nada duplicado
    expect((await audit(lotId)).status).toBe('intact');
  });

  it('gravação fora de ordem na âncora (2 antes de 1) é aceita', async () => {
    const offlineApp = createTestApp(pool, { audit: createTestAudit(pool, { anchor: unreachableAnchor() }) });
    const lotId = await createLiveLot();
    await bid(offlineApp, c1, lotId, 10_000);
    await bid(offlineApp, c2, lotId, 11_000);

    const service = createTestAudit(pool);
    expect(await service.confirmCheckpoint(lotId, 2)).toBe('confirmed');
    expect(await service.confirmCheckpoint(lotId, 1)).toBe('confirmed');
    expect((await audit(lotId)).status).toBe('intact');
  });

  it('o reconciliador não ancora checkpoint pendente de um histórico adulterado e nunca assina de novo', async () => {
    const offlineApp = createTestApp(pool, { audit: createTestAudit(pool, { anchor: unreachableAnchor() }) });
    const lotId = await createLiveLot();
    await bid(offlineApp, c1, lotId, 10_000);
    const before = (await pool.query('SELECT signature, last_hash FROM audit_checkpoints WHERE lot_id = $1', [lotId])).rows[0];

    await pool.query('UPDATE bids SET amount_cents = 50 WHERE lot_id = $1', [lotId]);
    await recomputeChain(lotId);

    expect(await createTestAudit(pool).reconcilePending()).toEqual({ confirmed: 0, stillPending: 0, rejected: 1 });
    expect(await testAnchor().entriesForLot(lotId)).toEqual([]);
    const after = (await pool.query('SELECT signature, last_hash, anchor_status FROM audit_checkpoints WHERE lot_id = $1', [lotId])).rows[0];
    expect(after).toEqual({ ...before, anchor_status: 'pending' });
    expect((await audit(lotId)).status).toBe('tampered');
  });

  it('conflito: a âncora já tem outro conteúdo para o mesmo lance; nada é sobrescrito', async () => {
    const offlineApp = createTestApp(pool, { audit: createTestAudit(pool, { anchor: unreachableAnchor() }) });
    const lotId = await createLiveLot();
    await bid(offlineApp, c1, lotId, 10_000);
    const fakeHash = 'f'.repeat(64);
    await testAnchor().append({
      lotId,
      bidCount: 1,
      lastHash: fakeHash,
      signature: testKeyring.sign(checkpointMessage({ lotId, bidCount: 1, lastHash: fakeHash, keyVersion: 1 })),
      keyVersion: 1,
    });

    expect(await createTestAudit(pool).confirmCheckpoint(lotId, 1)).toBe('pending');
    expect((await testAnchor().entriesForLot(lotId))[0].lastHash).toBe(fakeHash);
    expect((await audit(lotId)).status).toBe('tampered');
  });

  it('âncora indisponível na verificação: INDISPONÍVEL, nunca ÍNTEGRO; mas adulteração local continua aparecendo', async () => {
    const lotId = await lotWithThreeBids();
    const offlineApp = createTestApp(pool, { audit: createTestAudit(pool, { anchor: unreachableAnchor() }) });

    const unavailable = await audit(lotId, offlineApp);
    expect(unavailable.status).toBe('unavailable');
    expect(unavailable.statusLabel).toBe('VERIFICAÇÃO INDISPONÍVEL');

    await pool.query('UPDATE bids SET amount_cents = 1 WHERE lot_id = $1 AND seq = 1', [lotId]);
    expect((await audit(lotId, offlineApp)).status).toBe('tampered');
  });

  it('lances sem nenhum checkpoint (anteriores à auditoria): INDISPONÍVEL, nunca ÍNTEGRO', async () => {
    const lotId = await lotWithThreeBids();
    // Simula lances legados: sem checkpoints e sem âncora.
    await pool.query('DELETE FROM audit_checkpoints WHERE lot_id = $1', [lotId]);
    const otherLot = await createLiveLot();
    const legacy = await createTestAudit(pool).verifyLot(otherLot);
    expect(legacy?.status).toBe('intact'); // sem lances

    // Para o lote com lances apagamos também a âncora do teste, como se nunca tivesse existido.
    const { resetTestAnchor } = await import('./helpers.js');
    await resetTestAnchor();
    const result = await audit(lotId);
    expect(result.status).toBe('unavailable');
    expect(result.reason).toMatch(/antes da auditoria/);
  });
});
