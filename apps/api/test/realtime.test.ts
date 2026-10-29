// Tempo real (etapa 12) com servidor HTTP real, Socket.IO real e clientes socket.io-client reais.
// Lances, depósitos e cancelamentos passam pelas rotas HTTP de verdade; o teste só observa o que
// cada cliente recebe. PostgreSQL e âncora de teste reais.
import { randomUUID } from 'node:crypto';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as connectClient, type Socket as ClientSocket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runSeed } from '../src/db/seed-data.js';
import type { AuditService } from '../src/modules/audit/service.js';
import { attachRealtime, type Realtime } from '../src/modules/realtime/socket.js';
import { settleLot } from '../src/modules/settlement/service.js';
import { deposit } from '../src/modules/wallet/service.js';
import { createTestApp, createTestAudit, createTestPool, resetDatabase, sessionCookie } from './helpers.js';

const pool = createTestPool(12);
let audit: AuditService;
let httpServer: HttpServer;
let realtime: Realtime;
let baseUrl: string;
let clients: ClientSocket[] = [];
let ids: { seller: string; c1: string; c2: string };
let cookies: { seller: string; c1: string; c2: string };

// ---------- auxiliares ----------

type Received = { event: string; payload: unknown };

/** Cliente real. Guarda tudo o que recebe, na ordem, para o teste conferir depois. */
async function connect(options: { cookie?: string; origin?: string } = {}) {
  const headers: Record<string, string> = {};
  if (options.cookie) headers.cookie = options.cookie;
  if (options.origin) headers.origin = options.origin;
  const socket = connectClient(baseUrl, {
    transports: ['websocket'],
    extraHeaders: headers,
    reconnection: false,
    forceNew: true,
  });
  clients.push(socket);
  const received: Received[] = [];
  socket.onAny((event: string, payload: unknown) => received.push({ event, payload }));

  const state = await new Promise<{ authenticated: boolean; role: string | null }>((resolve, reject) => {
    socket.once('session.state', resolve);
    socket.once('connect_error', reject);
  });
  return { socket, received, state };
}

async function subscribe(socket: ClientSocket, lotId: string) {
  return (await socket.timeout(5_000).emitWithAck('lot.subscribe', { lotId })) as { ok: boolean; code?: string };
}

/** Espera um evento que satisfaça a condição (ou falha em 5 s). */
async function waitFor<T>(received: Received[], event: string, match: (payload: T) => boolean = () => true): Promise<T> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const found = received.find((item) => item.event === event && match(item.payload as T));
    if (found) return found.payload as T;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Evento ${event} não chegou.`);
}

/** Dá tempo para eventos indevidos chegarem antes de afirmar que não chegaram. */
const settle = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));
const eventsNamed = (received: Received[], event: string) => received.filter((item) => item.event === event);

async function login(email: string) {
  return sessionCookie(await request(baseUrl).post('/api/auth/login').send({ email, password: 'leilao-demo-2026' }));
}

function bidHttp(cookie: string, lotId: string, amountCents: number) {
  return request(baseUrl)
    .post(`/api/lots/${lotId}/bids`)
    .set('Cookie', cookie)
    .set('Idempotency-Key', randomUUID())
    .send({ amountCents });
}

/** Lote ao vivo direto no banco. Terminando em 60 s, qualquer lance prorroga (até 120 s restantes). */
async function createLot(endsInMs: number) {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO lots (seller_id, snapshot_id, starting_bid_cents, min_increment_cents, starts_at, original_ends_at, ends_at)
     SELECT $1, (SELECT id FROM item_snapshots LIMIT 1), 10000, 1000,
            date_trunc('milliseconds', now()) - interval '1 minute',
            date_trunc('milliseconds', now()) + $2 * interval '1 millisecond',
            date_trunc('milliseconds', now()) + $2 * interval '1 millisecond'
     RETURNING id`,
    [ids.seller, endsInMs],
  );
  return result.rows[0].id;
}

/** Nada que identifique a pessoa ou revele saldo pode aparecer em evento de sala pública. */
function expectNoPrivateData(payload: unknown) {
  const text = JSON.stringify(payload);
  for (const secret of [ids.c1, ids.c2, ids.seller, 'cliente1', 'cliente2', 'leiloeiro', '@example.com']) {
    expect(text).not.toContain(secret);
  }
  for (const field of ['bidderId', 'previousLeaderId', 'winnerId', 'sellerId', 'receiptToken', 'totalCents', 'availableCents', 'committedCents']) {
    expect(text).not.toContain(field);
  }
}

beforeEach(async () => {
  await resetDatabase(pool);
  await runSeed(pool);
  audit = createTestAudit(pool);
  httpServer = createServer(createTestApp(pool, { audit }));
  realtime = attachRealtime(httpServer, { pool, isProduction: false });
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;

  const { rows } = await pool.query<{ id: string; email: string }>('SELECT id, email FROM users');
  const idOf = (email: string) => rows.find((row) => row.email === email)!.id;
  ids = { seller: idOf('leiloeiro@example.com'), c1: idOf('cliente1@example.com'), c2: idOf('cliente2@example.com') };
  cookies = {
    seller: await login('leiloeiro@example.com'),
    c1: await login('cliente1@example.com'),
    c2: await login('cliente2@example.com'),
  };
  clients = [];
});

afterEach(async () => {
  for (const socket of clients) socket.disconnect();
  realtime.close();
  await new Promise((resolve) => httpServer.close(resolve));
});

afterAll(async () => {
  await pool.end();
});

// ---------- sala pública ----------

describe('sala pública do lote', () => {
  it('dois clientes reais veem o lance e o novo fim sem recarregar, iguais ao HTTP e sem dados privados', async () => {
    const lotId = await createLot(60_000);
    const visitor = await connect(); // sem login
    const bidder2 = await connect({ cookie: cookies.c2 });
    expect(visitor.state.authenticated).toBe(false);
    expect(bidder2.state.authenticated).toBe(true);
    expect((await subscribe(visitor.socket, lotId)).ok).toBe(true);
    expect((await subscribe(bidder2.socket, lotId)).ok).toBe(true);

    const response = await bidHttp(cookies.c1, lotId, 10_000);
    expect(response.status).toBe(201);
    expect(response.body.lot.extended).toBe(true);
    const newEnd: string = response.body.lot.endsAt;
    const version: number = response.body.lot.version;

    for (const client of [visitor, bidder2]) {
      const accepted = await waitFor<{ seq: number; alias: string; amountCents: number; version: number }>(
        client.received,
        'bid.accepted',
      );
      expect(accepted).toMatchObject({ seq: 1, amountCents: 10_000, version });
      expect(accepted.alias).toMatch(/^LIC-/);
      const extended = await waitFor<{ endsAt: string; version: number }>(client.received, 'lot.extended');
      expect(extended).toMatchObject({ endsAt: newEnd, version });
      const updated = await waitFor<{ endsAt: string; version: number; bidCount: number; currentBidCents: number }>(
        client.received,
        'lot.updated',
      );
      expect(updated).toMatchObject({ endsAt: newEnd, version, bidCount: 1, currentBidCents: 10_000, status: 'live' });
      for (const item of client.received.filter((entry) => entry.event !== 'session.state')) {
        if (!item.event.startsWith('wallet') && item.event !== 'bid.outbid') expectNoPrivateData(item.payload);
      }
    }

    // O mesmo estado por HTTP (a fonte da verdade).
    const http = await request(baseUrl).get(`/api/lots/${lotId}`);
    expect(http.body.lot).toMatchObject({ version, endsAt: newEnd, bidCount: 1 });
  });

  it('versão cresce a cada mudança: o cliente consegue descartar evento antigo', async () => {
    const lotId = await createLot(600_000);
    const visitor = await connect();
    await subscribe(visitor.socket, lotId);

    expect((await bidHttp(cookies.c1, lotId, 10_000)).status).toBe(201);
    expect((await bidHttp(cookies.c2, lotId, 11_000)).status).toBe(201);
    await waitFor<{ seq: number }>(visitor.received, 'bid.accepted', (bid) => bid.seq === 2);
    await waitFor<{ bidCount: number }>(visitor.received, 'lot.updated', (lot) => lot.bidCount === 2);

    const bidVersions = eventsNamed(visitor.received, 'bid.accepted').map((item) => (item.payload as { version: number }).version);
    expect(bidVersions[1]).toBeGreaterThan(bidVersions[0]);
    // lot.updated relê o banco: a versão dele nunca é menor que a do lance que o gerou.
    const updates = eventsNamed(visitor.received, 'lot.updated').map((item) => item.payload as { version: number; bidCount: number });
    for (const update of updates) expect(update.version).toBeGreaterThanOrEqual(bidVersions[update.bidCount - 1]);
    expect(Math.max(...updates.map((update) => update.version))).toBe(bidVersions[1]);
  });

  it('cancelamento chega à sala como lot.updated', async () => {
    const lotId = await createLot(600_000);
    const visitor = await connect();
    await subscribe(visitor.socket, lotId);

    const response = await request(baseUrl).post(`/api/lots/${lotId}/cancel`).set('Cookie', cookies.seller);
    expect(response.status).toBe(200);
    const updated = await waitFor<{ status: string; version: number }>(visitor.received, 'lot.updated');
    expect(updated.status).toBe('cancelled');
    expect(updated.version).toBe(response.body.lot.version);
  });

  it('encerramento: sala recebe o resultado público; comprovante só para vencedor e leiloeiro', async () => {
    const lotId = await createLot(600_000);
    const visitor = await connect();
    const winner = await connect({ cookie: cookies.c1 });
    const seller = await connect({ cookie: cookies.seller });
    const loser = await connect({ cookie: cookies.c2 });
    await subscribe(visitor.socket, lotId);
    expect((await bidHttp(cookies.c1, lotId, 15_000)).status).toBe(201);
    await waitFor(winner.received, 'wallet.updated');

    const endsAt = (await pool.query<{ ends_at: Date }>('SELECT ends_at FROM lots WHERE id = $1', [lotId])).rows[0].ends_at;
    const outcome = await settleLot(pool, lotId, { audit, clock: async () => new Date(endsAt.getTime() + 1_000) });
    expect(outcome.result).toBe('settled');

    const closed = await waitFor<{ winnerAlias: string; finalAmountCents: number }>(visitor.received, 'lot.closed');
    expect(closed.finalAmountCents).toBe(15_000);
    expect(closed.winnerAlias).toMatch(/^LIC-/);
    expectNoPrivateData(closed);
    // (O status vem do relógio real do banco; aqui a liquidação usou um relógio adiantado.)
    const updated = await waitFor<{ settled: boolean; result: { finalAmountCents: number } }>(
      visitor.received,
      'lot.updated',
      (lot) => lot.settled,
    );
    expect(updated.result.finalAmountCents).toBe(15_000);
    expectNoPrivateData(updated);

    const won = await waitFor<{ receiptToken: string }>(winner.received, 'lot.won');
    const sold = await waitFor<{ receiptToken: string }>(seller.received, 'lot.sold');
    expect(won.receiptToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(sold.receiptToken).toBe(won.receiptToken);
    const wallet = await waitFor<{ totalCents: number; committedCents: number }>(
      winner.received,
      'wallet.updated',
      (balance) => balance.totalCents === 1_000_000 - 15_000,
    );
    expect(wallet.committedCents).toBe(0);

    await settle();
    expect(eventsNamed(loser.received, 'lot.won')).toHaveLength(0);
    expect(eventsNamed(visitor.received, 'lot.won')).toHaveLength(0);
    expect(eventsNamed(visitor.received, 'lot.sold')).toHaveLength(0);
  });

  it('lote inexistente ou id inválido não abre sala', async () => {
    const visitor = await connect();
    expect(await subscribe(visitor.socket, randomUUID())).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(await subscribe(visitor.socket, 'qualquer-coisa')).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });
});

// ---------- sala privada ----------

describe('sala privada do usuário', () => {
  it('carteira e aviso de superado chegam só ao dono', async () => {
    const lotId = await createLot(600_000);
    const visitor = await connect();
    const c1 = await connect({ cookie: cookies.c1 });
    const c2 = await connect({ cookie: cookies.c2 });
    await subscribe(visitor.socket, lotId);

    expect((await bidHttp(cookies.c1, lotId, 10_000)).status).toBe(201);
    const afterOwnBid = await waitFor<{ committedCents: number; availableCents: number }>(c1.received, 'wallet.updated');
    expect(afterOwnBid).toMatchObject({ committedCents: 10_000, availableCents: 990_000 });

    expect((await bidHttp(cookies.c2, lotId, 12_000)).status).toBe(201);
    const outbid = await waitFor<{ lotId: string }>(c1.received, 'bid.outbid');
    expect(outbid.lotId).toBe(lotId);
    // A reserva do c1 foi liberada: o saldo novo chega a ele.
    await waitFor<{ committedCents: number }>(c1.received, 'wallet.updated', (balance) => balance.committedCents === 0);
    await waitFor<{ committedCents: number }>(c2.received, 'wallet.updated', (balance) => balance.committedCents === 12_000);

    await settle();
    // c2 nunca recebeu o saldo do c1 (nem o contrário); visitante nunca recebe saldo.
    for (const item of eventsNamed(c2.received, 'wallet.updated')) {
      expect((item.payload as { committedCents: number }).committedCents).toBe(12_000);
    }
    expect(eventsNamed(c2.received, 'bid.outbid')).toHaveLength(0);
    expect(eventsNamed(visitor.received, 'wallet.updated')).toHaveLength(0);
    expect(eventsNamed(visitor.received, 'bid.outbid')).toHaveLength(0);
  });

  it('depósito atualiza a carteira na sala privada', async () => {
    const c1 = await connect({ cookie: cookies.c1 });
    const response = await request(baseUrl)
      .post('/api/wallet/deposits')
      .set('Cookie', cookies.c1)
      .set('Idempotency-Key', randomUUID())
      .send({ amountCents: 5_000 });
    expect(response.status).toBe(201);
    const wallet = await waitFor<{ totalCents: number }>(c1.received, 'wallet.updated');
    expect(wallet.totalCents).toBe(1_005_000);
  });

  it('cliente não entra na sala de outra pessoa informando o id dela', async () => {
    const intruder = await connect({ cookie: cookies.c2 });
    // Tentativas: eventos que não existem, sala alheia como "lote" e id de usuário como lote.
    intruder.socket.emit('join', `user:${ids.c1}`);
    intruder.socket.emit('subscribe', { userId: ids.c1 });
    intruder.socket.emit('user.subscribe', { userId: ids.c1 });
    expect(await subscribe(intruder.socket, `user:${ids.c1}`)).toMatchObject({ ok: false });
    expect(await subscribe(intruder.socket, ids.c1)).toMatchObject({ ok: false, code: 'NOT_FOUND' });

    // No servidor, o socket do c2 só está na própria sala (e na sala com o próprio id do socket).
    const serverSocket = realtime.io.of('/').sockets.get(intruder.socket.id!)!;
    expect([...serverSocket.rooms].sort()).toEqual([intruder.socket.id, `user:${ids.c2}`].sort());

    // E um depósito do c1 não chega ao c2.
    await deposit(pool, ids.c1, 5_000, randomUUID());
    await settle();
    expect(eventsNamed(intruder.received, 'wallet.updated')).toHaveLength(0);
  });

  it('licitante só recebe a sala privada com cookie válido; visitante não tem sala privada', async () => {
    const visitor = await connect();
    const serverSocket = realtime.io.of('/').sockets.get(visitor.socket.id!)!;
    expect([...serverSocket.rooms]).toEqual([visitor.socket.id]);

    const forged = await connect({ cookie: `sid=${'A'.repeat(43)}` });
    expect(forged.state.authenticated).toBe(false);
  });
});

// ---------- sessão, origem e reconexão ----------

describe('sessão e origem', () => {
  it('logout tira a conexão da sala privada na hora', async () => {
    const c1 = await connect({ cookie: cookies.c1 });
    expect((await request(baseUrl).post('/api/auth/logout').set('Cookie', cookies.c1)).status).toBe(204);
    const ended = await waitFor<{ reason: string }>(c1.received, 'session.ended');
    expect(ended.reason).toBe('revoked');

    await deposit(pool, ids.c1, 5_000, randomUUID());
    await settle();
    expect(eventsNamed(c1.received, 'wallet.updated')).toHaveLength(0);
    // A conexão continua aberta como visitante: dados públicos seguem liberados.
    expect(c1.socket.connected).toBe(true);
  });

  it('sessão expirada sai da sala privada na conferência periódica e não entra em nova conexão', async () => {
    const c2 = await connect({ cookie: cookies.c2 });
    await pool.query(
      `UPDATE sessions SET created_at = now() - interval '8 days', expires_at = now() - interval '1 second'
        WHERE user_id = $1`,
      [ids.c2],
    );
    await realtime.recheckSessions();
    const ended = await waitFor<{ reason: string }>(c2.received, 'session.ended');
    expect(ended.reason).toBe('expired');

    await deposit(pool, ids.c2, 5_000, randomUUID());
    await settle();
    expect(eventsNamed(c2.received, 'wallet.updated')).toHaveLength(0);

    const again = await connect({ cookie: cookies.c2 });
    expect(again.state.authenticated).toBe(false);
  });

  it('conexão vinda de outro site é recusada; a mesma origem é aceita', async () => {
    await expect(connect({ cookie: cookies.c1, origin: 'https://site-malicioso.example' })).rejects.toThrow();
    const sameOrigin = await connect({ cookie: cookies.c1, origin: baseUrl });
    expect(sameOrigin.state.authenticated).toBe(true);
  });
});

describe('desconexão e reconexão', () => {
  it('lance aceito enquanto o cliente estava desconectado é recuperado por HTTP ao reconectar', async () => {
    const lotId = await createLot(60_000);
    const first = await connect();
    await subscribe(first.socket, lotId);
    const before = (await request(baseUrl).get(`/api/lots/${lotId}`)).body.lot as { version: number; endsAt: string };

    // A conexão cai e, durante a queda, um lance é aceito (e prorroga o fim).
    first.socket.disconnect();
    const response = await bidHttp(cookies.c2, lotId, 10_000);
    expect(response.status).toBe(201);
    await settle();
    expect(eventsNamed(first.received, 'bid.accepted')).toHaveLength(0); // o evento foi perdido

    // Reconexão: o servidor não reenvia eventos perdidos; o cliente busca o estado por HTTP.
    const second = await connect();
    expect((await subscribe(second.socket, lotId)).ok).toBe(true);
    const [lot, bids] = await Promise.all([
      request(baseUrl).get(`/api/lots/${lotId}`),
      request(baseUrl).get(`/api/lots/${lotId}/bids`),
    ]);
    expect(lot.body.lot.version).toBeGreaterThan(before.version);
    expect(lot.body.lot.endsAt).toBe(response.body.lot.endsAt);
    expect(new Date(lot.body.lot.endsAt).getTime()).toBeGreaterThan(new Date(before.endsAt).getTime());
    expect(bids.body.bids).toHaveLength(1);
    expect(bids.body.bids[0]).toMatchObject({ seq: 1, amountCents: 10_000 });

    // Depois de reconectar, os próximos eventos voltam a chegar.
    expect((await bidHttp(cookies.c1, lotId, 11_000)).status).toBe(201);
    await waitFor<{ seq: number }>(second.received, 'bid.accepted', (bid) => bid.seq === 2);
  });

  it('se a projeção falhar depois do COMMIT, o lance continua valendo e o HTTP mostra o estado final', async () => {
    const lotId = await createLot(600_000);
    const visitor = await connect();
    await subscribe(visitor.socket, lotId);
    // Simula a falha: o Socket.IO para de projetar eventos (como se a conexão do servidor caísse).
    realtime.close();
    const response = await bidHttp(cookies.c1, lotId, 10_000);
    expect(response.status).toBe(201);
    await settle();
    expect(eventsNamed(visitor.received, 'bid.accepted')).toHaveLength(0);
    const lot = await request(baseUrl).get(`/api/lots/${lotId}`);
    expect(lot.body.lot).toMatchObject({ bidCount: 1, currentBidCents: 10_000, version: response.body.lot.version });
  });
});
