import type { Pool } from 'pg';
import { AnchorUnavailableError, type AnchorEntry, type AnchorStore } from './anchor.js';
import { checkpointMessage, type Keyring } from './keys.js';
import { computeBidChain, type AnchorStatus, type IntegrityRecorder } from './recorder.js';
import {
  AUDIT_STATUS_LABEL,
  checkChain,
  verifyHistory,
  type AnchorView,
  type LotForAudit,
  type StoredBid,
  type StoredCheckpoint,
  type VerificationResult,
} from './verify.js';

/**
 * Serviço de auditoria: liga a cadeia de hashes, a assinatura Ed25519 e a âncora independente.
 * Protocolo descrito em docs/AUDITORIA.md, seção 4.
 */

type LotRow = {
  id: string;
  seller_id: string;
  snapshot_id: string;
  starting_bid_cents: number;
  min_increment_cents: number;
  starts_at: Date;
  original_ends_at: Date;
  ends_at: Date;
  bid_count: number;
  leader_bid_id: string | null;
};

type BidRow = {
  id: string;
  seq: number;
  bidder_id: string;
  bidder_ref: string;
  public_alias: string;
  amount_cents: number;
  accepted_at: Date;
  prev_hash: string;
  hash: string;
};

type CheckpointRow = { bid_count: number; last_hash: string; signature: string; key_version: number; anchor_status: AnchorStatus };

export type AuditReport = VerificationResult & {
  lotId: string;
  statusLabel: string;
  checkedAt: string;
  bidCount: number;
  bids: {
    seq: number;
    alias: string;
    amountCents: number;
    acceptedAt: string;
    bidderRef: string;
    prevHash: string;
    hash: string;
  }[];
};

export type AuditService = ReturnType<typeof createAuditService>;

export function createAuditService({ pool, anchor, keyring }: { pool: Pool; anchor: AnchorStore; keyring: Keyring }) {
  async function loadLot(lotId: string): Promise<LotForAudit | null> {
    const result = await pool.query<LotRow>('SELECT * FROM lots WHERE id = $1', [lotId]);
    const row = result.rows[0];
    if (!row) return null;
    return {
      lotId: row.id,
      sellerId: row.seller_id,
      snapshotId: row.snapshot_id,
      startingBidCents: row.starting_bid_cents,
      minIncrementCents: row.min_increment_cents,
      startsAt: row.starts_at,
      originalEndsAt: row.original_ends_at,
      endsAt: row.ends_at,
      bidCount: row.bid_count,
      leaderBidId: row.leader_bid_id,
    };
  }

  async function loadBids(lotId: string, upTo?: number): Promise<StoredBid[]> {
    const result = await pool.query<BidRow>(
      `SELECT id, seq, bidder_id, bidder_ref, public_alias, amount_cents, accepted_at, prev_hash, hash
         FROM bids WHERE lot_id = $1 AND ($2::int IS NULL OR seq <= $2) ORDER BY seq, id`,
      [lotId, upTo ?? null],
    );
    return result.rows.map((row) => ({
      id: row.id,
      seq: row.seq,
      bidderId: row.bidder_id,
      bidderRef: row.bidder_ref,
      alias: row.public_alias,
      amountCents: row.amount_cents,
      acceptedAt: row.accepted_at,
      prevHash: row.prev_hash,
      hash: row.hash,
    }));
  }

  async function loadCheckpoints(lotId: string): Promise<(StoredCheckpoint & { anchorStatus: AnchorStatus })[]> {
    const result = await pool.query<CheckpointRow>(
      'SELECT bid_count, last_hash, signature, key_version, anchor_status FROM audit_checkpoints WHERE lot_id = $1 ORDER BY bid_count',
      [lotId],
    );
    return result.rows.map((row) => ({
      bidCount: row.bid_count,
      lastHash: row.last_hash,
      signature: row.signature,
      keyVersion: row.key_version,
      anchorStatus: row.anchor_status,
    }));
  }

  /**
   * Depois do COMMIT: grava o checkpoint na âncora (idempotente) e marca 'confirmed'.
   * Âncora fora do ar: continua 'pending' (o reconciliador tenta de novo).
   * Conflito (a âncora tem outro conteúdo): não sobrescreve; a verificação mostrará adulteração.
   */
  async function confirmCheckpoint(lotId: string, bidCount: number): Promise<AnchorStatus> {
    const result = await pool.query<CheckpointRow>(
      'SELECT bid_count, last_hash, signature, key_version, anchor_status FROM audit_checkpoints WHERE lot_id = $1 AND bid_count = $2',
      [lotId, bidCount],
    );
    const checkpoint = result.rows[0];
    if (!checkpoint) return 'pending';
    if (checkpoint.anchor_status === 'confirmed') return 'confirmed';

    const entry: AnchorEntry = {
      lotId,
      bidCount,
      lastHash: checkpoint.last_hash,
      signature: checkpoint.signature,
      keyVersion: checkpoint.key_version,
    };
    let outcome: 'stored' | 'conflict';
    try {
      outcome = await anchor.append(entry);
    } catch (error) {
      if (error instanceof AnchorUnavailableError) return 'pending';
      throw error;
    }
    if (outcome === 'conflict') {
      console.error(`[auditoria] CONFLITO na âncora para o lote ${lotId}, lance ${bidCount}: a âncora tem outro conteúdo.`);
      return 'pending';
    }

    await pool.query(
      `UPDATE audit_checkpoints SET anchor_status = 'confirmed', confirmed_at = now()
        WHERE lot_id = $1 AND bid_count = $2 AND anchor_status = 'pending'`,
      [lotId, bidCount],
    );
    return 'confirmed';
  }

  const recorder: IntegrityRecorder = {
    prepareBid: computeBidChain,

    async afterBidInserted(client, input, integrity) {
      const signature = keyring.sign(
        checkpointMessage({ lotId: input.lot.lotId, bidCount: input.seq, lastHash: integrity.hash, keyVersion: keyring.keyVersion }),
      );
      await client.query(
        `INSERT INTO audit_checkpoints (lot_id, bid_count, last_hash, signature, key_version, anchor_status)
         VALUES ($1, $2, $3, $4, $5, 'pending')`,
        [input.lot.lotId, input.seq, integrity.hash, signature, keyring.keyVersion],
      );
    },

    afterCommit: confirmCheckpoint,
  };

  /**
   * Reconciliador: ancora checkpoints pendentes. Antes, confere a assinatura e que a cadeia
   * ATUAL do banco ainda gera o hash assinado. Nunca assina de novo: só reenvia assinaturas
   * criadas na hora do lance. Checkpoint que não confere não é ancorado.
   */
  async function reconcilePending(limit = 200) {
    const pending = await pool.query<{ lot_id: string } & CheckpointRow>(
      `SELECT lot_id, bid_count, last_hash, signature, key_version, anchor_status
         FROM audit_checkpoints WHERE anchor_status = 'pending'
        ORDER BY created_at, lot_id, bid_count
        LIMIT $1`,
      [limit],
    );
    const summary = { confirmed: 0, stillPending: 0, rejected: 0 };

    for (const checkpoint of pending.rows) {
      const message = checkpointMessage({
        lotId: checkpoint.lot_id,
        bidCount: checkpoint.bid_count,
        lastHash: checkpoint.last_hash,
        keyVersion: checkpoint.key_version,
      });
      const lot = await loadLot(checkpoint.lot_id);
      const bids = lot ? await loadBids(checkpoint.lot_id, checkpoint.bid_count) : [];
      const valid =
        lot !== null &&
        keyring.verify(message, checkpoint.signature, checkpoint.key_version) &&
        bids.length === checkpoint.bid_count &&
        checkChain(lot, bids) === null &&
        bids.at(-1)?.hash === checkpoint.last_hash;

      if (!valid) {
        summary.rejected++;
        console.error(
          `[auditoria] Checkpoint pendente NÃO ancorado (não confere com o banco): lote ${checkpoint.lot_id}, lance ${checkpoint.bid_count}.`,
        );
        continue;
      }

      const status = await confirmCheckpoint(checkpoint.lot_id, checkpoint.bid_count);
      if (status === 'confirmed') summary.confirmed++;
      else summary.stillPending++;
    }
    return summary;
  }

  /** Verificação pública de um lote. null se o lote não existe. */
  async function verifyLot(lotId: string): Promise<AuditReport | null> {
    const lot = await loadLot(lotId);
    if (!lot) return null;
    const bids = await loadBids(lotId);
    const checkpoints = await loadCheckpoints(lotId);

    let anchorView: AnchorView;
    try {
      anchorView = { available: true, entries: await anchor.entriesForLot(lotId) };
    } catch (error) {
      if (!(error instanceof AnchorUnavailableError)) throw error;
      anchorView = { available: false, reason: error.message };
    }

    const result = verifyHistory({ lot, bids, checkpoints, anchor: anchorView, keyring });
    return {
      ...result,
      lotId,
      statusLabel: AUDIT_STATUS_LABEL[result.status],
      checkedAt: new Date().toISOString(),
      bidCount: bids.length,
      bids: bids.map((bid) => ({
        seq: bid.seq,
        alias: bid.alias,
        amountCents: bid.amountCents,
        acceptedAt: bid.acceptedAt.toISOString(),
        bidderRef: bid.bidderRef,
        prevHash: bid.prevHash,
        hash: bid.hash,
      })),
    };
  }

  /** Verificação global: lotes que a âncora conhece e que sumiram do banco principal. */
  async function findLotsMissingFromDatabase(): Promise<string[]> {
    const anchoredLots = await anchor.lotIds();
    if (anchoredLots.length === 0) return [];
    const existing = await pool.query<{ id: string }>('SELECT id FROM lots WHERE id = ANY($1::uuid[])', [anchoredLots]);
    const present = new Set(existing.rows.map((row) => row.id));
    return anchoredLots.filter((lotId) => !present.has(lotId));
  }

  /** Roda o reconciliador agora e depois a cada `intervalMs`. Devolve a função que para. */
  function startReconciler(intervalMs: number): () => void {
    let running = false;
    const tick = async () => {
      if (running) return;
      running = true;
      try {
        const summary = await reconcilePending();
        if (summary.confirmed || summary.rejected) {
          console.log(
            `[auditoria] reconciliação: ${summary.confirmed} confirmado(s), ${summary.stillPending} pendente(s), ${summary.rejected} recusado(s).`,
          );
        }
      } catch (error) {
        console.error(`[auditoria] falha na reconciliação: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        running = false;
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), intervalMs);
    timer.unref();
    return () => clearInterval(timer);
  }

  return { recorder, confirmCheckpoint, reconcilePending, verifyLot, findLotsMissingFromDatabase, startReconciler, keyring };
}
