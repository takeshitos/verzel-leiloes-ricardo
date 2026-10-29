// Autenticação com as rotas e o banco reais (PostgreSQL de teste). Nada de mock.
import { createHash } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { runSeed } from '../src/db/seed-data.js';
import { createTestApp, createTestPool, resetDatabase, sessionCookie, setCookies } from './helpers.js';

const pool = createTestPool();
let app: ReturnType<typeof createTestApp>;

beforeEach(async () => {
  await resetDatabase(pool);
  app = createTestApp(pool); // app novo a cada teste: zera os limitadores de tentativa
});

afterAll(async () => {
  await pool.end();
});

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

async function register(email: string, role: 'seller' | 'bidder', password = 'senha-forte-123') {
  return request(app).post('/api/auth/register').send({ email, password, role });
}

describe('cadastro', () => {
  it('cria licitante com carteira, pseudônimo aleatório e cookie de sessão HttpOnly', async () => {
    const response = await register('  Ana@Example.com ', 'bidder');

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      user: { email: 'ana@example.com', role: 'bidder', publicAlias: expect.stringMatching(/^LIC-[0-9A-F]{6}$/) },
    });

    const cookie = setCookies(response)[0];
    expect(cookie).toMatch(/^sid=[A-Za-z0-9_-]{43};/);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).not.toContain('Secure'); // só em produção

    // O banco guarda só o hash do token, nunca o token.
    const token = sessionCookie(response).slice('sid='.length);
    const sessions = await pool.query('SELECT token_hash FROM sessions');
    expect(sessions.rows).toEqual([{ token_hash: sha256(token) }]);

    const wallet = await pool.query(
      "SELECT w.total_cents FROM wallets w JOIN users u ON u.id = w.user_id WHERE u.email = 'ana@example.com'",
    );
    expect(wallet.rows).toEqual([{ total_cents: 0 }]);
  });

  it('cria leiloeiro com pseudônimo VEN-', async () => {
    const response = await register('leilao@example.com', 'seller');
    expect(response.status).toBe(201);
    expect(response.body.user.publicAlias).toMatch(/^VEN-[0-9A-F]{6}$/);
  });

  it('recusa email já cadastrado, mesmo com maiúsculas', async () => {
    await register('bia@example.com', 'bidder');
    const response = await register('BIA@example.com', 'seller');

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('EMAIL_ALREADY_USED');
    const users = await pool.query('SELECT role FROM users');
    expect(users.rows).toEqual([{ role: 'bidder' }]); // papel original não mudou
  });

  it('aceita só os papéis seller e bidder', async () => {
    const response = await register('admin@example.com', 'admin' as 'seller');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details.fields.role).toMatch(/seller.*bidder/);
  });

  it('recusa campos extras em vez de ignorá-los (ex.: tentar virar admin)', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({ email: 'x@example.com', password: 'senha-forte-123', role: 'bidder', isAdmin: true });

    expect(response.status).toBe(400);
    expect(response.body.error.details.fields._).toContain('isAdmin');
  });

  it('valida email e tamanho da senha com mensagens por campo', async () => {
    const response = await request(app).post('/api/auth/register').send({ email: 'nao-e-email', password: '123', role: 'bidder' });

    expect(response.status).toBe(400);
    expect(response.body.error.details.fields).toEqual({
      email: 'Informe um email válido.',
      password: 'A senha precisa ter pelo menos 8 caracteres.',
    });
  });

  it('nunca devolve senha, hash ou token no corpo', async () => {
    const response = await register('seguro@example.com', 'bidder', 'senha-secreta-999');
    const token = sessionCookie(response).slice('sid='.length);
    const body = JSON.stringify(response.body);

    expect(body).not.toContain('senha-secreta-999');
    expect(body).not.toContain('scrypt');
    expect(body).not.toContain(token);
    expect(body).not.toMatch(/password|hash|token|"id"/i);
  });
});

describe('login', () => {
  it('entra com as três contas do seed e a senha documentada', async () => {
    await runSeed(pool);
    const accounts = [
      ['leiloeiro@example.com', 'seller'],
      ['cliente1@example.com', 'bidder'],
      ['cliente2@example.com', 'bidder'],
    ] as const;

    for (const [email, role] of accounts) {
      const response = await request(app).post('/api/auth/login').send({ email, password: 'leilao-demo-2026' });
      expect(response.status, email).toBe(200);
      expect(response.body.user).toMatchObject({ email, role });
      expect(sessionCookie(response)).toMatch(/^sid=/);
    }
  });

  it('senha errada e email inexistente recebem a mesma resposta 401', async () => {
    await register('caio@example.com', 'bidder');

    const wrongPassword = await request(app).post('/api/auth/login').send({ email: 'caio@example.com', password: 'errada-123' });
    const unknownEmail = await request(app).post('/api/auth/login').send({ email: 'ninguem@example.com', password: 'errada-123' });

    for (const response of [wrongPassword, unknownEmail]) {
      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: { code: 'INVALID_CREDENTIALS', message: 'Email ou senha incorretos.' } });
      expect(setCookies(response)).toEqual([]);
    }
  });

  it('gera token novo a cada login e revoga o anterior enviado no cookie', async () => {
    const first = sessionCookie(await register('dani@example.com', 'bidder'));
    const second = await request(app)
      .post('/api/auth/login')
      .set('Cookie', first)
      .send({ email: 'dani@example.com', password: 'senha-forte-123' });

    expect(second.status).toBe(200);
    expect(sessionCookie(second)).not.toBe(first);
    expect((await request(app).get('/api/auth/me').set('Cookie', first)).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set('Cookie', sessionCookie(second))).status).toBe(200);
  });

  it('limita tentativas por email: a 11ª em 15 minutos recebe 429 com Retry-After', async () => {
    await register('alvo@example.com', 'bidder');

    for (let attempt = 1; attempt <= 10; attempt++) {
      const response = await request(app).post('/api/auth/login').send({ email: 'alvo@example.com', password: 'chute-errado' });
      expect(response.status).toBe(401);
    }
    const blocked = await request(app).post('/api/auth/login').send({ email: 'alvo@example.com', password: 'senha-forte-123' });

    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('TOO_MANY_REQUESTS');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });
});

describe('sessão e logout', () => {
  it('sem cookie, /me responde 401', async () => {
    const response = await request(app).get('/api/auth/me');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('com cookie válido, /me devolve o usuário', async () => {
    const cookie = sessionCookie(await register('eva@example.com', 'seller'));
    const response = await request(app).get('/api/auth/me').set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({ email: 'eva@example.com', role: 'seller' });
  });

  it('logout revoga a sessão no banco e o cookie antigo deixa de funcionar', async () => {
    const cookie = sessionCookie(await register('fabio@example.com', 'bidder'));

    const logout = await request(app).post('/api/auth/logout').set('Cookie', cookie);
    expect(logout.status).toBe(204);
    expect(setCookies(logout)[0]).toMatch(/^sid=;.*Expires=Thu, 01 Jan 1970/);

    const sessions = await pool.query('SELECT count(*) AS total FROM sessions');
    expect(sessions.rows[0].total).toBe(0);
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
  });

  it('sessão expirada não autentica e o cookie é limpo', async () => {
    const cookie = sessionCookie(await register('gil@example.com', 'bidder'));
    await pool.query("UPDATE sessions SET created_at = now() - interval '8 days', expires_at = now() - interval '1 second'");

    const response = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(response.status).toBe(401);
    expect(setCookies(response)[0]).toMatch(/^sid=;/);
  });

  it('token inventado não autentica', async () => {
    await register('hugo@example.com', 'bidder');
    const fake = `sid=${'A'.repeat(43)}`;
    expect((await request(app).get('/api/auth/me').set('Cookie', fake)).status).toBe(401);
  });
});

describe('proteção contra CSRF', () => {
  it('recusa POST com Origin de outro site', async () => {
    const response = await request(app).post('/api/auth/logout').set('Origin', 'https://site-malicioso.example');
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN_ORIGIN');
  });

  it('recusa POST que o navegador marca como cross-site', async () => {
    const response = await request(app).post('/api/auth/logout').set('Sec-Fetch-Site', 'cross-site');
    expect(response.status).toBe(403);
  });

  it('aceita POST da mesma origem', async () => {
    const response = await request(app)
      .post('/api/auth/logout')
      .set('Host', 'leilao.test')
      .set('Origin', 'http://leilao.test')
      .set('Sec-Fetch-Site', 'same-origin');
    expect(response.status).toBe(204);
  });

  it('recusa corpo que não é JSON (formulário de outro site)', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .type('form')
      .send({ email: 'x@example.com', password: 'qualquer-coisa' });
    expect(response.status).toBe(415);
    expect(response.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });
});

describe('cookie em produção', () => {
  it('usa o prefixo __Host- e o atributo Secure', async () => {
    const productionApp = createTestApp(pool, { isProduction: true });
    const response = await request(productionApp)
      .post('/api/auth/register')
      .send({ email: 'prod@example.com', password: 'senha-forte-123', role: 'bidder' });

    const cookie = setCookies(response)[0];
    expect(cookie).toMatch(/^__Host-sid=/);
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('HttpOnly');
  });
});
