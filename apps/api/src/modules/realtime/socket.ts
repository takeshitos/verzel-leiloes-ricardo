import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { Pool } from 'pg';
import { Server, type Socket } from 'socket.io';
import { describeError } from '../../shared/describe-error.js';
import { findSessionUser, hashSessionToken, sessionCookieName } from '../auth/session.js';
import type { UserRole } from '../auth/alias.js';
import { UUID_FORMAT } from '../lots/public-routes.js';
import { findPublicLot, type PublicLot } from '../lots/queries.js';
import { readBalance, type WalletBalance } from '../wallet/ledger.js';
import {
  onBidAccepted,
  onLotChanged,
  onLotClosed,
  onSessionRevoked,
  onWalletChanged,
  type BidAcceptedEvent,
  type LotClosedEvent,
} from './events.js';

/**
 * Tempo real (Socket.IO) no MESMO servidor HTTP da API.
 *
 * - Nada aqui altera dinheiro, lance ou lote: os eventos são uma projeção do que já foi
 *   gravado (COMMIT). Lance continua sendo só POST /api/lots/:id/bids.
 * - Sala pública `lot:{id}`: qualquer um (até visitante) entra pedindo `lot.subscribe`.
 * - Sala privada `user:{id}`: o SERVIDOR coloca o socket nela a partir do cookie de sessão
 *   no handshake. Não existe evento para o cliente escolher a sala de outra pessoa.
 * - Sessão revogada (logout) ou expirada sai da sala privada; a conexão continua como visitante.
 * - Cada lote tem `version` crescente; o cliente descarta evento velho e, se perceber lacuna,
 *   busca o estado por HTTP (GET /api/lots/:id e /bids), que é sempre a fonte da verdade.
 * - Uma instância só. Várias instâncias exigiriam um adapter (ex.: Redis) e coordenação extra.
 */

// ---------- Contrato dos eventos (o frontend tem uma cópia em apps/web/src/realtime/types.ts) ----------

/** Resumo público do lote: só o que muda durante a disputa. Sem email, ids de usuário ou saldo. */
export type LotUpdatedPayload = {
  lotId: string;
  version: number;
  status: PublicLot['status'];
  settled: boolean;
  startsAt: string;
  endsAt: string;
  currentBidCents: number | null;
  nextMinimumBidCents: number;
  bidCount: number;
  leaderAlias: string | null;
  result: PublicLot['result'];
  serverTime: string;
};

export type ServerToClientEvents = {
  'session.state': (payload: { authenticated: boolean; role: UserRole | null; serverTime: string }) => void;
  'session.ended': (payload: { reason: 'revoked' | 'expired' }) => void;
  // Sala pública do lote
  'lot.updated': (payload: LotUpdatedPayload) => void;
  'bid.accepted': (payload: {
    lotId: string;
    version: number;
    seq: number;
    alias: string;
    amountCents: number;
    acceptedAt: string;
    auditStatus: 'pending' | 'confirmed';
    serverTime: string;
  }) => void;
  'lot.extended': (payload: { lotId: string; version: number; endsAt: string; serverTime: string }) => void;
  'lot.closed': (payload: {
    lotId: string;
    version: number;
    settledAt: string;
    winnerAlias: string | null;
    finalAmountCents: number | null;
    serverTime: string;
  }) => void;
  // Sala privada do usuário
  'wallet.updated': (payload: WalletBalance & { asOf: string }) => void;
  'bid.outbid': (payload: { lotId: string; version: number }) => void;
  'lot.won': (payload: { lotId: string; version: number; finalAmountCents: number | null; receiptToken: string | null }) => void;
  'lot.sold': (payload: {
    lotId: string;
    version: number;
    winnerAlias: string | null;
    finalAmountCents: number | null;
    receiptToken: string | null;
  }) => void;
};

export type SubscribeAck = { ok: true; serverTime: string } | { ok: false; code: string; message: string };

export type ClientToServerEvents = {
  'lot.subscribe': (payload: { lotId: string }, ack: (result: SubscribeAck) => void) => void;
  'lot.unsubscribe': (payload: { lotId: string }) => void;
};

type SocketData = {
  userId: string | null;
  role: UserRole | null;
  /** SHA-256 do token da sessão (nunca o token). Usado para encerrar a sala privada no logout. */
  tokenHash: string | null;
};

type RealtimeSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

export type RealtimeOptions = {
  pool: Pool;
  isProduction: boolean;
  /** De quanto em quanto tempo as sessões das conexões abertas são conferidas no banco. */
  sessionRecheckMs?: number;
};

export type Realtime = {
  io: Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
  /** Confere agora se as sessões das conexões ainda valem (o intervalo também faz isso). */
  recheckSessions: () => Promise<void>;
  /** Desliga as conexões e os ouvintes. Não fecha o servidor HTTP (quem chama decide). */
  close: () => void;
};

/** Salas de lote que um mesmo socket pode acompanhar ao mesmo tempo (vitrine + sala + painel). */
const MAX_LOT_ROOMS_PER_SOCKET = 30;

const lotRoom = (lotId: string) => `lot:${lotId}`;
const userRoom = (userId: string) => `user:${userId}`;
const nowIso = () => new Date().toISOString();

export function attachRealtime(httpServer: HttpServer, options: RealtimeOptions): Realtime {
  const { pool } = options;
  const cookieName = sessionCookieName(options.isProduction);

  const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(httpServer, {
    serveClient: false, // o frontend usa o pacote socket.io-client do build
    maxHttpBufferSize: 10_000, // mensagens do cliente são pequenas ({ lotId })
    // Mesma origem: navegador de outro site não abre a conexão (o WebSocket não passa por CORS).
    allowRequest: (req, callback) => callback(null, isSameOrigin(req)),
  });

  // Handshake: identifica o usuário pelo cookie HttpOnly, igual às rotas HTTP. Sem sessão
  // válida a conexão segue como visitante (dados públicos continuam liberados).
  io.use(async (socket, next) => {
    socket.data.userId = null;
    socket.data.role = null;
    socket.data.tokenHash = null;
    const token = readCookie(socket.request.headers.cookie, cookieName);
    if (!token) return next();
    try {
      const user = await findSessionUser(pool, token);
      if (user) {
        socket.data.userId = user.id;
        socket.data.role = user.role;
        socket.data.tokenHash = hashSessionToken(token);
      }
      next();
    } catch (error) {
      console.error(`[tempo real] Falha ao validar sessão: ${describeError(error)}`);
      next(new Error('Não foi possível validar a sessão. Tente de novo.'));
    }
  });

  io.on('connection', (socket: RealtimeSocket) => {
    if (socket.data.userId) void socket.join(userRoom(socket.data.userId));
    socket.emit('session.state', {
      authenticated: socket.data.userId !== null,
      role: socket.data.role,
      serverTime: nowIso(),
    });

    socket.on('lot.subscribe', async (payload, ack) => {
      if (typeof ack !== 'function') return;
      const lotId = typeof payload?.lotId === 'string' ? payload.lotId : '';
      if (!UUID_FORMAT.test(lotId)) {
        ack({ ok: false, code: 'NOT_FOUND', message: 'Lote não encontrado.' });
        return;
      }
      const lotRooms = [...socket.rooms].filter((room) => room.startsWith('lot:')).length;
      if (!socket.rooms.has(lotRoom(lotId)) && lotRooms >= MAX_LOT_ROOMS_PER_SOCKET) {
        ack({ ok: false, code: 'TOO_MANY_SUBSCRIPTIONS', message: 'Acompanhe menos lotes ao mesmo tempo.' });
        return;
      }
      try {
        const exists = await pool.query('SELECT 1 FROM lots WHERE id = $1', [lotId]);
        if (!exists.rowCount) {
          ack({ ok: false, code: 'NOT_FOUND', message: 'Lote não encontrado.' });
          return;
        }
        await socket.join(lotRoom(lotId));
        ack({ ok: true, serverTime: nowIso() });
      } catch (error) {
        console.error(`[tempo real] Falha ao entrar na sala do lote: ${describeError(error)}`);
        ack({ ok: false, code: 'INTERNAL_ERROR', message: 'Não foi possível acompanhar o lote agora.' });
      }
    });

    socket.on('lot.unsubscribe', (payload) => {
      const lotId = typeof payload?.lotId === 'string' ? payload.lotId : '';
      if (UUID_FORMAT.test(lotId)) void socket.leave(lotRoom(lotId));
    });
    // Qualquer outro evento enviado pelo cliente é ignorado (não há handler).
  });

  // ---------- Projeção dos eventos de domínio (todos publicados depois do COMMIT) ----------

  /** Relê o lote no banco e manda o resumo público. Versão do banco >= versão do evento. */
  async function emitLotUpdated(lotId: string): Promise<void> {
    const lot = await findPublicLot(pool, lotId);
    if (!lot) return;
    io.to(lotRoom(lotId)).emit('lot.updated', {
      lotId: lot.id,
      version: lot.version,
      status: lot.status,
      settled: lot.settled,
      startsAt: lot.startsAt,
      endsAt: lot.endsAt,
      currentBidCents: lot.currentBidCents,
      nextMinimumBidCents: lot.nextMinimumBidCents,
      bidCount: lot.bidCount,
      leaderAlias: lot.leaderAlias,
      result: lot.result,
      serverTime: nowIso(),
    });
  }

  /**
   * Relê o saldo no banco e manda SÓ para a sala privada do dono. `asOf` (horário da leitura no
   * banco) deixa o cliente descartar um saldo mais antigo que chegue depois de um mais novo.
   */
  async function emitWallet(userId: string): Promise<void> {
    const [balance, asOf] = await Promise.all([
      readBalance(pool, userId),
      pool.query<{ as_of: Date }>('SELECT statement_timestamp() AS as_of'),
    ]);
    io.to(userRoom(userId)).emit('wallet.updated', { ...balance, asOf: asOf.rows[0].as_of.toISOString() });
  }

  async function projectBid(event: BidAcceptedEvent): Promise<void> {
    const room = lotRoom(event.lotId);
    // Parte pública: pseudônimo, valor do lance (já público no histórico) e horários.
    // Nunca bidderId, previousLeaderId, email ou saldo.
    io.to(room).emit('bid.accepted', {
      lotId: event.lotId,
      version: event.version,
      seq: event.seq,
      alias: event.alias,
      amountCents: event.amountCents,
      acceptedAt: event.acceptedAt,
      auditStatus: event.auditStatus,
      serverTime: nowIso(),
    });
    if (event.extended) {
      io.to(room).emit('lot.extended', {
        lotId: event.lotId,
        version: event.version,
        endsAt: event.endsAt,
        serverTime: nowIso(),
      });
    }
    await emitLotUpdated(event.lotId);

    // Parte privada: saldo novo de quem deu o lance e de quem perdeu a liderança.
    await emitWallet(event.bidderId);
    if (event.previousLeaderId && event.previousLeaderId !== event.bidderId) {
      io.to(userRoom(event.previousLeaderId)).emit('bid.outbid', { lotId: event.lotId, version: event.version });
      await emitWallet(event.previousLeaderId);
    }
  }

  async function projectClosed(event: LotClosedEvent): Promise<void> {
    io.to(lotRoom(event.lotId)).emit('lot.closed', {
      lotId: event.lotId,
      version: event.version,
      settledAt: event.settledAt,
      winnerAlias: event.winnerAlias,
      finalAmountCents: event.finalAmountCents,
      serverTime: nowIso(),
    });
    await emitLotUpdated(event.lotId);

    // O link do comprovante vai só para o vencedor e o leiloeiro.
    if (event.winnerId) {
      io.to(userRoom(event.winnerId)).emit('lot.won', {
        lotId: event.lotId,
        version: event.version,
        finalAmountCents: event.finalAmountCents,
        receiptToken: event.receiptToken,
      });
      await emitWallet(event.winnerId);
    }
    io.to(userRoom(event.sellerId)).emit('lot.sold', {
      lotId: event.lotId,
      version: event.version,
      winnerAlias: event.winnerAlias,
      finalAmountCents: event.finalAmountCents,
      receiptToken: event.receiptToken,
    });
  }

  /** Falha ao projetar não desfaz nada (o COMMIT já aconteceu): o cliente se recupera por HTTP. */
  function project(what: string, work: () => Promise<void>): void {
    work().catch((error: unknown) => {
      console.error(`[tempo real] Falha ao enviar ${what}: ${describeError(error)}`);
    });
  }

  // ---------- Sessões: logout e expiração ----------

  function endPrivateAccess(socket: RealtimeSocket, reason: 'revoked' | 'expired'): void {
    if (!socket.data.userId) return;
    void socket.leave(userRoom(socket.data.userId));
    socket.data.userId = null;
    socket.data.role = null;
    socket.data.tokenHash = null;
    socket.emit('session.ended', { reason });
  }

  async function recheckSessions(): Promise<void> {
    const sockets = [...io.of('/').sockets.values()].filter((socket) => socket.data.tokenHash);
    if (sockets.length === 0) return;
    const hashes = [...new Set(sockets.map((socket) => socket.data.tokenHash!))];
    const valid = await pool.query<{ token_hash: string }>(
      'SELECT token_hash FROM sessions WHERE token_hash = ANY($1::text[]) AND expires_at > now()',
      [hashes],
    );
    const stillValid = new Set(valid.rows.map((row) => row.token_hash));
    for (const socket of sockets) {
      if (!stillValid.has(socket.data.tokenHash!)) endPrivateAccess(socket, 'expired');
    }
  }

  const stopListening = [
    onBidAccepted((event) => project('lance aceito', () => projectBid(event))),
    onLotClosed((event) => project('lote encerrado', () => projectClosed(event))),
    onLotChanged((event) => project('lote alterado', () => emitLotUpdated(event.lotId))),
    onWalletChanged((event) => project('saldo', () => emitWallet(event.userId))),
    onSessionRevoked((event) => {
      for (const socket of io.of('/').sockets.values()) {
        if (socket.data.tokenHash === event.tokenHash) endPrivateAccess(socket, 'revoked');
      }
    }),
  ];

  const recheckTimer = setInterval(() => {
    recheckSessions().catch((error: unknown) => {
      console.error(`[tempo real] Falha ao conferir sessões: ${describeError(error)}`);
    });
  }, options.sessionRecheckMs ?? 60_000);
  recheckTimer.unref();

  return {
    io,
    recheckSessions,
    close() {
      clearInterval(recheckTimer);
      for (const stop of stopListening) stop();
      io.disconnectSockets(true);
    },
  };
}

/** Navegador sempre manda Origin no WebSocket; ele precisa ser o próprio host. Sem Origin = não é navegador. */
function isSameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

/** Lê um cookie do cabeçalho do handshake. O token de sessão é base64url (não precisa decodificar). */
function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index !== -1 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return null;
}
