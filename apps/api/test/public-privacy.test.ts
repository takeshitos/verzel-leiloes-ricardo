// Nenhuma resposta PÚBLICA (sem login) pode carregar dado pessoal ou financeiro de alguém.
// Cenário completo e real: lote, dois lances pela rota HTTP, liquidação e comprovante.
// Depois, cada rota pública é lida como TEXTO: esconder um campo na tela não basta, o JSON
// não pode trazer email, id interno de usuário, senha, sessão, saldo ou ids privados.
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runSeed } from '../src/db/seed-data.js';
import type { AuditService } from '../src/modules/audit/service.js';
import { settleLot } from '../src/modules/settlement/service.js';
import { createTestApp, createTestAudit, createTestPool, resetDatabase, sessionCookie } from './helpers.js';

const pool = createTestPool(8);
let app: ReturnType<typeof createTestApp>;
let audit: AuditService;
let lotId: string;
let receiptToken: string;
let users: { id: string; email: string; token_hash: string | null }[];

async function login(email: string) {
  return sessionCookie(await request(app).post('/api/auth/login').send({ email, password: 'leilao-demo-2026' }));
}

beforeAll(async () => {
  await resetDatabase(pool);
  await runSeed(pool);
  audit = createTestAudit(pool);
  app = createTestApp(pool, { audit });

  const seller = (await pool.query<{ id: string }>("SELECT id FROM users WHERE email = 'leiloeiro@example.com'")).rows[0].id;
  lotId = (
    await pool.query<{ id: string }>(
      `INSERT INTO lots (seller_id, snapshot_id, starting_bid_cents, min_increment_cents, starts_at, original_ends_at, ends_at)
       SELECT $1, (SELECT id FROM item_snapshots LIMIT 1), 10000, 1000,
              date_trunc('milliseconds', now()) - interval '1 minute',
              date_trunc('milliseconds', now()) + interval '10 minutes',
              date_trunc('milliseconds', now()) + interval '10 minutes'
       RETURNING id`,
      [seller],
    )
  ).rows[0].id;

  const c1 = await login('cliente1@example.com');
  const c2 = await login('cliente2@example.com');
  for (const [cookie, amountCents] of [
    [c1, 10_000],
    [c2, 11_000],
  ] as const) {
    const response = await request(app)
      .post(`/api/lots/${lotId}/bids`)
      .set('Cookie', cookie)
      .set('Idempotency-Key', randomUUID())
      .send({ amountCents });
    expect(response.status).toBe(201);
  }

  const endsAt = (await pool.query<{ ends_at: Date }>('SELECT ends_at FROM lots WHERE id = $1', [lotId])).rows[0].ends_at;
  const outcome = await settleLot(pool, lotId, { audit, clock: async () => new Date(endsAt.getTime() + 1_000) });
  expect(outcome.result).toBe('settled');
  receiptToken = (await pool.query<{ public_token: string }>('SELECT public_token FROM receipts WHERE lot_id = $1', [lotId])).rows[0]
    .public_token;

  users = (
    await pool.query<{ id: string; email: string; token_hash: string | null }>(
      `SELECT u.id, u.email, s.token_hash FROM users u LEFT JOIN sessions s ON s.user_id = u.id`,
    )
  ).rows;
});

afterAll(async () => {
  await pool.end();
});

/** Campos que nunca podem aparecer numa resposta pública. */
const FORBIDDEN_KEYS = [
  'email',
  'password',
  'passwordHash',
  'password_hash',
  'token_hash',
  'session',
  'bidderId',
  'bidder_id',
  'sellerId',
  'seller_id',
  'winnerId',
  'winner_id',
  'userId',
  'user_id',
  'totalCents',
  'committedCents',
  'availableCents',
  'receiptToken',
  'stack',
];

describe('respostas públicas (sem login) não carregam dados pessoais', () => {
  it.each([
    ['vitrine', () => '/api/lots'],
    ['detalhe do lote', () => `/api/lots/${lotId}`],
    ['histórico de lances', () => `/api/lots/${lotId}/bids`],
    ['auditoria', () => `/api/lots/${lotId}/audit`],
    ['comprovante', () => `/api/receipts/${receiptToken}`],
    ['chave pública', () => '/api/audit/public-key'],
    ['saúde', () => '/api/health'],
    ['comprovante inexistente (404)', () => `/api/receipts/${'A'.repeat(43)}`],
    ['lote inexistente (404)', () => '/api/lots/00000000-0000-4000-8000-000000000000'],
    ['rota inexistente (404)', () => '/api/nao-existe'],
  ])('%s', async (_label, path) => {
    const response = await request(app).get(path());
    expect([200, 404]).toContain(response.status);
    const text = response.text;

    expect(text).not.toContain('@'); // nenhum email
    for (const user of users) {
      expect(text).not.toContain(user.id); // nenhum id interno de usuário
      expect(text).not.toContain(user.email);
      if (user.token_hash) expect(text).not.toContain(user.token_hash);
    }
    for (const key of FORBIDDEN_KEYS) expect(text).not.toContain(`"${key}"`);
    expect(response.headers['set-cookie']).toBeUndefined(); // rota pública não cria sessão
  });

  it('o cenário tem dados de verdade: o teste acima não passa por estar vazio', async () => {
    const bids = await request(app).get(`/api/lots/${lotId}/bids`);
    expect(bids.body.bids).toHaveLength(2);
    const receipt = await request(app).get(`/api/receipts/${receiptToken}`);
    expect(receipt.body.receipt).toMatchObject({ amountCents: 11_000, winnerAlias: expect.stringMatching(/^LIC-/) });
    expect(users.length).toBeGreaterThanOrEqual(3);
  });
});
