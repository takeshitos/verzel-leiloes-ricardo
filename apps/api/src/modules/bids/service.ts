import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { TransactionClient } from '../../db/transaction.js';
import { AppError } from '../../shared/errors.js';
import { withIdempotency } from '../../shared/idempotency.js';
import { chainOnlyRecorder, type AuditStatus, type IntegrityRecorder } from '../audit/recorder.js';
import { publishBidAccepted, type BidAcceptedEvent } from '../realtime/events.js';
import { lockWallets, readBalance, type WalletBalance } from '../wallet/ledger.js';
import { extendedEnd, minimumNextBid, validateBid } from './rules.js';

export type BidResponse = {
  bid: { id: string; seq: number; amountCents: number; acceptedAt: string; alias: string };
  lot: {
    id: string;
    version: number;
    endsAt: string;
    extended: boolean;
    currentBidCents: number;
    nextMinimumBidCents: number;
    bidCount: number;
    leaderAlias: string;
  };
  wallet: WalletBalance;
  audit: { status: AuditStatus };
};

type LockedLot = {
  id: string;
  seller_id: string;
  snapshot_id: string;
  cancelled_at: Date | null;
  starts_at: Date;
  original_ends_at: Date;
  ends_at: Date;
  starting_bid_cents: number;
  min_increment_cents: number;
  bid_count: number;
  leader_bid_id: string | null;
  version: number;
};

/** Relógio confiável: o do PostgreSQL, lido DEPOIS dos bloqueios, em milissegundos. */
export type Clock = (client: TransactionClient) => Promise<Date>;

export const databaseClock: Clock = async (client) => {
  const result = await client.query<{ now: Date }>("SELECT date_trunc('milliseconds', clock_timestamp()) AS now");
  return result.rows[0].now;
};

export type PlaceBidOptions = {
  clock?: Clock;
  integrity?: IntegrityRecorder;
};

/**
 * Lance transacional. Ordem (a mesma do protocolo em modules/wallet/ledger.ts):
 *   1. chave de idempotência (withIdempotency);
 *   2. bloqueia o lote (FOR UPDATE) e identifica o líder anterior;
 *   3. bloqueia as carteiras do licitante e do líder anterior, em ordem de user_id;
 *   4. lê o relógio do banco DEPOIS dos bloqueios e relê saldo e reservas;
 *   5. valida (qualquer recusa desfaz tudo);
 *   6. grava o lance com a cadeia de hashes, troca a reserva do lote, atualiza líder,
 *      contagem, versão e fim (prorrogação);
 *   7. COMMIT. Só então o evento é publicado.
 */
export async function placeBid(
  pool: Pool,
  params: { lotId: string; bidderId: string; amountCents: number; idempotencyKey: string },
  options: PlaceBidOptions = {},
): Promise<{ status: number; body: BidResponse; replayed: boolean }> {
  const clock = options.clock ?? databaseClock;
  const integrity = options.integrity ?? chainOnlyRecorder;
  let event: BidAcceptedEvent | undefined;

  const result = await withIdempotency<BidResponse>(
    pool,
    {
      userId: params.bidderId,
      scope: `lot.bid:${params.lotId}`,
      key: params.idempotencyKey,
      request: { lotId: params.lotId, amountCents: params.amountCents },
    },
    async (client) => {
      // 2. Lote bloqueado: nenhum outro lance, cancelamento ou liquidação mexe nele até o fim.
      const lotResult = await client.query<LockedLot>(
        `SELECT id, seller_id, snapshot_id, cancelled_at, starts_at, original_ends_at, ends_at,
                starting_bid_cents, min_increment_cents, bid_count, leader_bid_id, version
           FROM lots WHERE id = $1 FOR UPDATE`,
        [params.lotId],
      );
      const lot = lotResult.rows[0];
      if (!lot) throw new AppError(404, 'NOT_FOUND', 'Lote não encontrado.');

      const leader = lot.leader_bid_id
        ? (
            await client.query<{ bidder_id: string; amount_cents: number }>(
              'SELECT bidder_id, amount_cents FROM bids WHERE id = $1',
              [lot.leader_bid_id],
            )
          ).rows[0]
        : null;

      // 3. Carteiras envolvidas, sempre na mesma ordem.
      await lockWallets(client, leader ? [params.bidderId, leader.bidder_id] : [params.bidderId]);

      // 4. Relógio e saldo relidos com tudo bloqueado.
      const now = await clock(client);
      const balance = await readBalance(client, params.bidderId);

      // 5. Regras. Recusa = exceção = ROLLBACK (nada muda, nem a chave de idempotência).
      validateBid({
        lot: {
          cancelledAt: lot.cancelled_at,
          startsAt: lot.starts_at,
          endsAt: lot.ends_at,
          startingBidCents: lot.starting_bid_cents,
          minIncrementCents: lot.min_increment_cents,
          bidCount: lot.bid_count,
          currentBidCents: leader?.amount_cents ?? null,
          leaderId: leader?.bidder_id ?? null,
        },
        bidderId: params.bidderId,
        amountCents: params.amountCents,
        availableCents: balance.availableCents,
        now,
      });

      // 6. Efeitos.
      const alias = (
        await client.query<{ public_alias: string }>('SELECT public_alias FROM users WHERE id = $1', [params.bidderId])
      ).rows[0].public_alias;
      const bidId = randomUUID();
      const seq = lot.bid_count + 1;
      const recordInput = {
        lot: {
          lotId: lot.id,
          sellerId: lot.seller_id,
          snapshotId: lot.snapshot_id,
          startingBidCents: lot.starting_bid_cents,
          minIncrementCents: lot.min_increment_cents,
          startsAt: lot.starts_at,
          originalEndsAt: lot.original_ends_at,
          bidCount: lot.bid_count,
        },
        bidId,
        seq,
        bidderId: params.bidderId,
        alias,
        amountCents: params.amountCents,
        acceptedAt: now,
      };
      const chain = await integrity.prepareBid(client, recordInput);

      await client.query(
        `INSERT INTO bids (id, lot_id, seq, bidder_id, public_alias, amount_cents, accepted_at, bidder_ref, prev_hash, hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [bidId, lot.id, seq, params.bidderId, alias, params.amountCents, now, chain.bidderRef, chain.prevHash, chain.hash],
      );

      // A reserva do lote passa para o novo líder; a do líder anterior deixa de existir
      // (o valor volta ao disponível dele na hora).
      await client.query(
        `INSERT INTO reservations (lot_id, bidder_id, bid_id, amount_cents)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (lot_id) DO UPDATE
            SET bidder_id = EXCLUDED.bidder_id, bid_id = EXCLUDED.bid_id,
                amount_cents = EXCLUDED.amount_cents, created_at = now()`,
        [lot.id, params.bidderId, bidId, params.amountCents],
      );

      // GREATEST no SQL: o fim só pode aumentar. O PostgreSQL guarda microssegundos e o
      // JavaScript só milissegundos; regravar o fim lido no JS o encolheria alguns µs.
      const newEndsAt = extendedEnd(lot.ends_at, now);
      const updated = await client.query<{ version: number; ends_at: Date }>(
        `UPDATE lots SET bid_count = $2, leader_bid_id = $3, ends_at = GREATEST(ends_at, $4), version = version + 1
          WHERE id = $1
          RETURNING version, ends_at`,
        [lot.id, seq, bidId, newEndsAt],
      );

      await integrity.afterBidInserted(client, recordInput, chain);

      const nextMinimum = minimumNextBid({
        currentBidCents: params.amountCents,
        startingBidCents: lot.starting_bid_cents,
        minIncrementCents: lot.min_increment_cents,
      });
      const extended = updated.rows[0].ends_at.getTime() > lot.ends_at.getTime();

      event = {
        lotId: lot.id,
        version: updated.rows[0].version,
        seq,
        alias,
        amountCents: params.amountCents,
        acceptedAt: now.toISOString(),
        endsAt: updated.rows[0].ends_at.toISOString(),
        extended,
        nextMinimumBidCents: nextMinimum,
        auditStatus: 'pending',
        bidderId: params.bidderId,
        previousLeaderId: leader?.bidder_id ?? null,
      };

      return {
        status: 201,
        body: {
          bid: { id: bidId, seq, amountCents: params.amountCents, acceptedAt: now.toISOString(), alias },
          lot: {
            id: lot.id,
            version: updated.rows[0].version,
            endsAt: updated.rows[0].ends_at.toISOString(),
            extended,
            currentBidCents: params.amountCents,
            nextMinimumBidCents: nextMinimum,
            bidCount: seq,
            leaderAlias: alias,
          },
          wallet: await readBalance(client, params.bidderId),
          audit: { status: 'pending' },
        },
      };
    },
  );

  // 7. Depois do COMMIT: auditoria pós-commit (etapa 10) e evento. Repetição idempotente não republica.
  if (!result.replayed && event) {
    event.auditStatus = await integrity.afterCommit(event.lotId, event.seq);
    publishBidAccepted(event);
  }
  return result;
}
