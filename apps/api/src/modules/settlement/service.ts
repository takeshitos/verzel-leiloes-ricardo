import { randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import { withTransaction, type TransactionClient } from '../../db/transaction.js';
import type { AuditReport } from '../audit/service.js';
import type { AuditStatus } from '../audit/verify.js';
import { databaseClock, type Clock } from '../bids/service.js';
import { publishLotClosed, type LotClosedEvent } from '../realtime/events.js';
import { lockWallets } from '../wallet/ledger.js';

/**
 * Liquidação de um lote encerrado (etapa 11). Protocolo:
 *
 *   1. AUDITORIA (fora da transação, porque consulta a âncora, que é I/O externo):
 *      o histórico precisa estar ÍNTEGRO. Adulterado, pendente ou indisponível: o lote NÃO é
 *      liquidado; o motivo vai para settlement_issues (estado operacional visível).
 *   2. TRANSAÇÃO FINANCEIRA, com o mesmo protocolo de bloqueio do lance (wallet/ledger.ts):
 *      bloqueia o lote (FOR UPDATE), depois as carteiras do vencedor e do vendedor em ordem
 *      de user_id, e só então lê o relógio do banco.
 *      - já liquidado ou cancelado: não faz nada (idempotente);
 *      - relógio < fim: ainda não terminou ou foi prorrogado por um último lance; não faz nada;
 *      - o lote bloqueado precisa ser o mesmo que a auditoria verificou (mesma quantidade de
 *        lances e mesmo hash do último); se mudou, tenta de novo no próximo ciclo;
 *      - com vencedor: remove a reserva, debita o total do vencedor, credita o vendedor, grava
 *        os dois lançamentos, a liquidação e o comprovante; sem lances: só a liquidação;
 *      - sobe a versão do lote e apaga a pendência (se havia).
 *   3. Depois do COMMIT: publica o evento lot.closed.
 *
 * Defesas no banco, caso o código falhe: settlements e receipts têm o lote como chave
 * primária (uma liquidação e um comprovante por lote) e os lançamentos têm operation_key
 * única (settlement:<lote>:debit / :credit). Uma segunda execução nunca cobra de novo.
 */

/** O que a liquidação precisa da auditoria: a verificação completa de um lote. */
export type AuditGate = { verifyLot(lotId: string): Promise<AuditReport | null> };

export type SettlementIssueStatus = Exclude<AuditStatus, 'intact'> | 'failed';

/** Texto curto do estado operacional de um lote vencido que ainda não foi liquidado. */
export const SETTLEMENT_ISSUE_LABEL: Record<SettlementIssueStatus, string> = {
  tampered: 'Não liquidado: auditoria ADULTERADO',
  pending: 'Aguardando a confirmação da auditoria',
  unavailable: 'Aguardando a auditoria (verificação indisponível)',
  failed: 'Falha na liquidação (nova tentativa automática)',
};

export type SettleOutcome =
  | {
      lotId: string;
      result: 'settled';
      winnerAlias: string | null;
      amountCents: number | null;
      receiptToken: string | null;
    }
  | { lotId: string; result: 'already_settled' | 'not_due' | 'cancelled' | 'not_found' | 'state_changed' }
  | { lotId: string; result: 'blocked'; status: SettlementIssueStatus; reason: string; changed: boolean };

export type SettleOptions = { audit: AuditGate; clock?: Clock };

/** Dados congelados do comprovante. Só pseudônimos e dados públicos: nunca email, nome, saldo ou sessão. */
export type ReceiptPayload = {
  version: 1;
  reference: string;
  lotId: string;
  item: {
    title: string;
    creators: string | null;
    creationDate: string | null;
    provider: string;
    externalId: string;
    sourceUrl: string | null;
    license: string;
    imageUrl: string | null;
  };
  amountCents: number;
  currency: 'BRL';
  settledAt: string;
  winnerAlias: string;
  sellerAlias: string;
  winningBid: { seq: number; acceptedAt: string };
  audit: { bidCount: number; lastHash: string; statusAtSettlement: 'intact' };
};

/** Falha de consistência financeira detectada na transação: tudo é desfeito e o lote fica com pendência. */
export class SettlementInconsistencyError extends Error {}

type LockedLot = {
  id: string;
  seller_id: string;
  snapshot_id: string;
  cancelled_at: Date | null;
  ends_at: Date;
  bid_count: number;
  leader_bid_id: string | null;
};

type LeaderBid = {
  id: string;
  seq: number;
  bidder_id: string;
  public_alias: string;
  amount_cents: number;
  accepted_at: Date;
  hash: string;
};

/** Token do link público: 32 bytes aleatórios (256 bits) em base64url = 43 caracteres. */
export function newReceiptToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Referência legível da transação no comprovante (ex.: LIQ-3F9A1C07B2). Única no banco. */
function newReceiptReference(): string {
  return `LIQ-${randomBytes(5).toString('hex').toUpperCase()}`;
}

export const settlementOperationKey = (lotId: string, side: 'debit' | 'credit') => `settlement:${lotId}:${side}`;

/**
 * Bloqueia o lote e confere se ainda há o que liquidar. Devolve o resultado "nada a fazer"
 * ou null se o lote está vencido, não cancelado e sem liquidação (relógio lido após os locks).
 */
async function lockDueLot(
  client: TransactionClient,
  lotId: string,
  lockWalletsOf: (lot: LockedLot, leader: LeaderBid | null) => string[],
  clock: Clock,
) {
  const lot = (
    await client.query<LockedLot>(
      `SELECT id, seller_id, snapshot_id, cancelled_at, ends_at, bid_count, leader_bid_id
         FROM lots WHERE id = $1 FOR UPDATE`,
      [lotId],
    )
  ).rows[0];
  if (!lot) return { done: 'not_found' as const };
  const settled = await client.query('SELECT 1 FROM settlements WHERE lot_id = $1', [lotId]);
  if (settled.rowCount) return { done: 'already_settled' as const };
  if (lot.cancelled_at) return { done: 'cancelled' as const };

  const leader = lot.leader_bid_id
    ? (
        await client.query<LeaderBid>(
          'SELECT id, seq, bidder_id, public_alias, amount_cents, accepted_at, hash FROM bids WHERE id = $1',
          [lot.leader_bid_id],
        )
      ).rows[0]
    : null;

  const walletIds = lockWalletsOf(lot, leader);
  const wallets = walletIds.length > 0 ? await lockWallets(client, walletIds) : new Map<string, { totalCents: number }>();

  // Relógio DEPOIS dos bloqueios. Fim exclusivo: em now = fim o lote já está encerrado.
  const now = await clock(client);
  if (now < lot.ends_at) return { done: 'not_due' as const };
  return { done: null, lot, leader, wallets, now };
}

/**
 * Registra (ou atualiza) por que um lote vencido não foi liquidado. Também sob o bloqueio do
 * lote, para não gravar pendência num lote que outro executor acabou de liquidar.
 */
export async function recordSettlementIssue(
  pool: Pool,
  lotId: string,
  status: SettlementIssueStatus,
  reason: string,
  clock: Clock = databaseClock,
): Promise<SettleOutcome> {
  return withTransaction(pool, async (client) => {
    const state = await lockDueLot(client, lotId, () => [], clock);
    if (state.done) return { lotId, result: state.done };

    const previous = (
      await client.query<{ status: string; reason: string }>('SELECT status, reason FROM settlement_issues WHERE lot_id = $1', [
        lotId,
      ])
    ).rows[0];
    await client.query(
      `INSERT INTO settlement_issues (lot_id, status, reason) VALUES ($1, $2, $3)
       ON CONFLICT (lot_id) DO UPDATE
          SET status = EXCLUDED.status, reason = EXCLUDED.reason,
              attempts = settlement_issues.attempts + 1, updated_at = now()`,
      [lotId, status, reason],
    );
    const changed = !previous || previous.status !== status || previous.reason !== reason;
    return { lotId, result: 'blocked', status, reason, changed };
  });
}

/** Liquida um lote, se ele estiver vencido e com auditoria ÍNTEGRA. Seguro para repetir e para rodar em paralelo. */
export async function settleLot(pool: Pool, lotId: string, options: SettleOptions): Promise<SettleOutcome> {
  const clock = options.clock ?? databaseClock;

  // 1. Auditoria fora da transação financeira.
  const report = await options.audit.verifyLot(lotId);
  if (!report) return { lotId, result: 'not_found' };
  if (report.status !== 'intact') {
    return recordSettlementIssue(pool, lotId, report.status, report.reason, clock);
  }

  // 2. Transação financeira.
  let event: LotClosedEvent | undefined;
  const outcome = await withTransaction<SettleOutcome>(pool, async (client) => {
    const state = await lockDueLot(
      client,
      lotId,
      (lot, leader) => (leader ? [leader.bidder_id, lot.seller_id] : []),
      clock,
    );
    if (state.done) return { lotId, result: state.done };
    const { lot, leader, wallets, now } = state;

    // O que vai ser liquidado tem de ser exatamente o histórico que a auditoria aprovou.
    const verifiedLastHash = report.bids.at(-1)?.hash ?? null;
    if (lot.bid_count !== report.bidCount || (leader?.hash ?? null) !== verifiedLastHash) {
      return { lotId, result: 'state_changed' };
    }

    let receiptToken: string | null = null;
    if (!leader) {
      // Sem lances: encerra sem vencedor e sem cobrança.
      await client.query('INSERT INTO settlements (lot_id, settled_at) VALUES ($1, $2)', [lotId, now]);
    } else {
      const amount = leader.amount_cents;
      const reservation = (
        await client.query<{ bidder_id: string; bid_id: string; amount_cents: number }>(
          'SELECT bidder_id, bid_id, amount_cents FROM reservations WHERE lot_id = $1',
          [lotId],
        )
      ).rows[0];
      if (
        !reservation ||
        reservation.bid_id !== leader.id ||
        reservation.bidder_id !== leader.bidder_id ||
        reservation.amount_cents !== amount
      ) {
        throw new SettlementInconsistencyError('A reserva do lote não corresponde ao lance vencedor.');
      }
      if ((wallets.get(leader.bidder_id)?.totalCents ?? 0) < amount) {
        throw new SettlementInconsistencyError('O total da carteira do vencedor é menor que o lance vencedor.');
      }

      // A reserva vira débito: o comprometido cai e o total cai, juntos, nesta transação.
      await client.query('DELETE FROM reservations WHERE lot_id = $1', [lotId]);
      await client.query('UPDATE wallets SET total_cents = total_cents - $2, updated_at = now() WHERE user_id = $1', [
        leader.bidder_id,
        amount,
      ]);
      await client.query('UPDATE wallets SET total_cents = total_cents + $2, updated_at = now() WHERE user_id = $1', [
        lot.seller_id,
        amount,
      ]);
      await client.query(
        `INSERT INTO wallet_entries (user_id, kind, amount_cents, operation_key, lot_id)
         VALUES ($1, 'settlement_debit', $3, $4, $6), ($2, 'settlement_credit', $3, $5, $6)`,
        [
          leader.bidder_id,
          lot.seller_id,
          amount,
          settlementOperationKey(lotId, 'debit'),
          settlementOperationKey(lotId, 'credit'),
          lotId,
        ],
      );
      await client.query(
        `INSERT INTO settlements (lot_id, winner_id, winning_bid_id, amount_cents, settled_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [lotId, leader.bidder_id, leader.id, amount, now],
      );

      // Comprovante: cópia congelada do resultado, lida dos dados bloqueados nesta transação.
      const info = (
        await client.query<{
          title: string;
          creators: string | null;
          creation_date: string | null;
          external_id: string;
          source_url: string | null;
          license: string;
          image_url: string | null;
          seller_alias: string;
        }>(
          `SELECT s.title, s.creators, s.creation_date, s.external_id, s.source_url, s.license, s.image_url,
                  seller.public_alias AS seller_alias
             FROM item_snapshots s, users seller
            WHERE s.id = $1 AND seller.id = $2`,
          [lot.snapshot_id, lot.seller_id],
        )
      ).rows[0];
      const payload: ReceiptPayload = {
        version: 1,
        reference: newReceiptReference(),
        lotId,
        item: {
          title: info.title,
          creators: info.creators,
          creationDate: info.creation_date,
          provider: 'Cleveland Museum of Art',
          externalId: info.external_id,
          sourceUrl: info.source_url,
          license: info.license,
          imageUrl: info.image_url,
        },
        amountCents: amount,
        currency: 'BRL',
        settledAt: now.toISOString(),
        winnerAlias: leader.public_alias,
        sellerAlias: info.seller_alias,
        winningBid: { seq: leader.seq, acceptedAt: leader.accepted_at.toISOString() },
        audit: { bidCount: report.bidCount, lastHash: leader.hash, statusAtSettlement: 'intact' },
      };
      receiptToken = newReceiptToken();
      await client.query('INSERT INTO receipts (lot_id, public_token, payload) VALUES ($1, $2, $3)', [
        lotId,
        receiptToken,
        JSON.stringify(payload),
      ]);
    }

    await client.query('DELETE FROM settlement_issues WHERE lot_id = $1', [lotId]);
    const version = (
      await client.query<{ version: number }>('UPDATE lots SET version = version + 1 WHERE id = $1 RETURNING version', [lotId])
    ).rows[0].version;

    event = {
      lotId,
      version,
      settledAt: now.toISOString(),
      winnerAlias: leader?.public_alias ?? null,
      finalAmountCents: leader?.amount_cents ?? null,
      winnerId: leader?.bidder_id ?? null,
      sellerId: lot.seller_id,
      receiptToken,
    };
    return {
      lotId,
      result: 'settled',
      winnerAlias: leader?.public_alias ?? null,
      amountCents: leader?.amount_cents ?? null,
      receiptToken,
    };
  });

  // 3. Só depois do COMMIT.
  if (event) publishLotClosed(event);
  return outcome;
}
