// Middlewares reais de papel e propriedade, com sessões reais no PostgreSQL de teste.
// As rotas abaixo existem só no teste; as rotas de lotes, carteira e lances (etapas 07 a 09)
// usarão exatamente estes middlewares.
import cookieParser from 'cookie-parser';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { runSeed } from '../src/db/seed-data.js';
import { loadSessionUser, requireAuth, requireRole } from '../src/modules/auth/middleware.js';
import { requireLotOwner } from '../src/modules/lots/ownership.js';
import { errorHandler } from '../src/shared/errors.js';
import { createTestApp, createTestPool, resetDatabase, sessionCookie } from './helpers.js';

const pool = createTestPool();
let api: ReturnType<typeof createTestApp>;
let guarded: express.Express;

function buildGuardedApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(loadSessionUser(pool, false));
  app.get('/somente-logado', requireAuth, (req, res) => {
    res.json({ role: req.user!.role });
  });
  app.post('/somente-leiloeiro', requireRole('seller'), (_req, res) => {
    res.json({ ok: true });
  });
  app.post('/somente-licitante', requireRole('bidder'), (req, res) => {
    // O id usado é o da sessão, nunca algo enviado pelo cliente.
    res.json({ actingUserEmail: req.user!.email });
  });
  app.post('/lotes/:id/gerenciar', requireRole('seller'), requireLotOwner(pool), (_req, res) => {
    res.json({ ok: true });
  });
  app.use(errorHandler);
  return app;
}

async function login(email: string): Promise<string> {
  const response = await request(api).post('/api/auth/login').send({ email, password: 'leilao-demo-2026' });
  expect(response.status).toBe(200);
  return sessionCookie(response);
}

async function seedLotId(): Promise<string> {
  const result = await pool.query<{ id: string }>("SELECT id FROM lots WHERE seed_key = 'seed-lote-inicial'");
  return result.rows[0].id;
}

beforeEach(async () => {
  await resetDatabase(pool);
  await runSeed(pool);
  api = createTestApp(pool);
  guarded = buildGuardedApp();
});

afterAll(async () => {
  await pool.end();
});

describe('visitante (sem login)', () => {
  it('recebe 401 nas rotas protegidas', async () => {
    expect((await request(guarded).get('/somente-logado')).status).toBe(401);
    expect((await request(guarded).post('/somente-leiloeiro')).status).toBe(401);
    expect((await request(guarded).post('/somente-licitante')).status).toBe(401);
    expect((await request(guarded).post(`/lotes/${await seedLotId()}/gerenciar`)).status).toBe(401);
  });
});

describe('papéis', () => {
  it('licitante não acessa rota de leiloeiro (ex.: criar lote)', async () => {
    const cookie = await login('cliente1@example.com');
    const response = await request(guarded).post('/somente-leiloeiro').set('Cookie', cookie);

    expect(response.status).toBe(403);
    expect(response.body.error).toEqual({ code: 'FORBIDDEN', message: 'Apenas leiloeiros podem fazer isso.' });
    expect((await request(guarded).post('/somente-licitante').set('Cookie', cookie)).status).toBe(200);
  });

  it('leiloeiro não acessa rota de licitante (ex.: dar lance)', async () => {
    const cookie = await login('leiloeiro@example.com');
    const response = await request(guarded).post('/somente-licitante').set('Cookie', cookie);

    expect(response.status).toBe(403);
    expect(response.body.error.message).toContain('Leiloeiros não dão lances');
    expect((await request(guarded).post('/somente-leiloeiro').set('Cookie', cookie)).status).toBe(200);
  });

  it('enviar papel ou id no corpo e em cabeçalhos não muda nada', async () => {
    const cookie = await login('cliente1@example.com');
    const sellerId = (await pool.query<{ id: string }>("SELECT id FROM users WHERE email = 'leiloeiro@example.com'")).rows[0].id;

    const asSeller = await request(guarded)
      .post('/somente-leiloeiro')
      .set('Cookie', cookie)
      .set('X-User-Role', 'seller')
      .set('X-User-Id', sellerId)
      .send({ role: 'seller', userId: sellerId });
    expect(asSeller.status).toBe(403);

    const actingUser = await request(guarded)
      .post('/somente-licitante')
      .set('Cookie', cookie)
      .send({ userId: sellerId, email: 'leiloeiro@example.com' });
    expect(actingUser.body).toEqual({ actingUserEmail: 'cliente1@example.com' });
  });

  it('não existe forma de trocar o papel pela API de autenticação', async () => {
    const withRole = await request(api)
      .post('/api/auth/login')
      .send({ email: 'cliente1@example.com', password: 'leilao-demo-2026', role: 'seller' });
    expect(withRole.status).toBe(400);

    const reRegister = await request(api)
      .post('/api/auth/register')
      .send({ email: 'cliente1@example.com', password: 'outra-senha-123', role: 'seller' });
    expect(reRegister.status).toBe(409);

    const cookie = await login('cliente1@example.com');
    const me = await request(api).get('/api/auth/me').set('Cookie', cookie);
    expect(me.body.user.role).toBe('bidder');
  });
});

describe('propriedade do lote', () => {
  it('dono gerencia o próprio lote', async () => {
    const cookie = await login('leiloeiro@example.com');
    const response = await request(guarded).post(`/lotes/${await seedLotId()}/gerenciar`).set('Cookie', cookie);
    expect(response.status).toBe(200);
  });

  it('outro leiloeiro recebe 403 no lote que não é dele', async () => {
    const other = await request(api)
      .post('/api/auth/register')
      .send({ email: 'outro.leiloeiro@example.com', password: 'senha-forte-123', role: 'seller' });
    const response = await request(guarded)
      .post(`/lotes/${await seedLotId()}/gerenciar`)
      .set('Cookie', sessionCookie(other));

    expect(response.status).toBe(403);
    expect(response.body.error.message).toBe('Você só pode gerenciar os seus próprios lotes.');
  });

  it('licitante é barrado pelo papel antes da propriedade', async () => {
    const cookie = await login('cliente2@example.com');
    const response = await request(guarded).post(`/lotes/${await seedLotId()}/gerenciar`).set('Cookie', cookie);
    expect(response.status).toBe(403);
    expect(response.body.error.message).toBe('Apenas leiloeiros podem fazer isso.');
  });

  it('lote inexistente ou id inválido responde 404', async () => {
    const cookie = await login('leiloeiro@example.com');
    const unknown = await request(guarded)
      .post('/lotes/00000000-0000-4000-8000-000000000000/gerenciar')
      .set('Cookie', cookie);
    const invalid = await request(guarded).post('/lotes/abc/gerenciar').set('Cookie', cookie);

    expect(unknown.status).toBe(404);
    expect(invalid.status).toBe(404);
  });
});
