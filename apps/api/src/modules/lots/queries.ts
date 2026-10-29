import type { Pool, PoolClient } from 'pg';
import { SETTLEMENT_ISSUE_LABEL, type SettlementIssueStatus } from '../settlement/service.js';

export type LotStatus = 'scheduled' | 'live' | 'ended' | 'cancelled';

type Queryable = Pool | PoolClient;

/**
 * Estado público calculado na hora, pelo relógio do PostgreSQL. Não existe coluna "status":
 * assim nunca há um status desatualizado. Encerrado ainda sem liquidação aparece como
 * status 'ended' com settled = false.
 */
export const LOT_STATUS_SQL = `
  CASE
    WHEN l.cancelled_at IS NOT NULL THEN 'cancelled'
    WHEN now() < l.starts_at THEN 'scheduled'
    WHEN now() < l.ends_at THEN 'live'
    ELSE 'ended'
  END`;

const PUBLIC_LOT_SELECT = `
  SELECT l.id,
         ${LOT_STATUS_SQL} AS status,
         l.starts_at, l.ends_at, l.starting_bid_cents, l.min_increment_cents, l.bid_count,
         leader.amount_cents AS current_bid_cents,
         leader.public_alias AS leader_alias,
         seller.public_alias AS seller_alias,
         (st.lot_id IS NOT NULL) AS settled,
         winner.public_alias AS winner_alias,
         st.amount_cents AS final_amount_cents,
         s.title, s.creators, s.creation_date, s.technique, s.item_type, s.culture, s.measurements,
         s.image_url, s.image_width, s.image_height, s.source_url, s.license, s.external_id, s.fetched_at,
         l.created_at, l.version
    FROM lots l
    JOIN item_snapshots s ON s.id = l.snapshot_id
    JOIN users seller ON seller.id = l.seller_id
    LEFT JOIN bids leader ON leader.id = l.leader_bid_id
    LEFT JOIN settlements st ON st.lot_id = l.id
    LEFT JOIN users winner ON winner.id = st.winner_id`;

type PublicLotRow = {
  id: string;
  status: LotStatus;
  starts_at: Date;
  ends_at: Date;
  starting_bid_cents: number;
  min_increment_cents: number;
  bid_count: number;
  current_bid_cents: number | null;
  leader_alias: string | null;
  seller_alias: string;
  settled: boolean;
  winner_alias: string | null;
  final_amount_cents: number | null;
  title: string;
  creators: string | null;
  creation_date: string | null;
  technique: string | null;
  item_type: string | null;
  culture: string | null;
  measurements: string | null;
  image_url: string | null;
  image_width: number | null;
  image_height: number | null;
  source_url: string | null;
  license: string;
  external_id: string;
  fetched_at: Date;
  created_at: Date;
  version: number;
};

/** Formato público do lote: só pseudônimos e dados do snapshot, nunca email ou ids de usuário. */
export type PublicLot = ReturnType<typeof toPublicLot>;

function toPublicLot(row: PublicLotRow) {
  return {
    id: row.id,
    // Cresce a cada mudança do lote (lance, cancelamento, liquidação). O tempo real usa para
    // descartar atualização antiga e perceber quando precisa buscar o estado de novo.
    version: row.version,
    status: row.status,
    settled: row.settled,
    startsAt: row.starts_at.toISOString(),
    endsAt: row.ends_at.toISOString(),
    startingBidCents: row.starting_bid_cents,
    minIncrementCents: row.min_increment_cents,
    currentBidCents: row.current_bid_cents,
    nextMinimumBidCents:
      row.current_bid_cents === null ? row.starting_bid_cents : row.current_bid_cents + row.min_increment_cents,
    bidCount: row.bid_count,
    leaderAlias: row.leader_alias,
    sellerAlias: row.seller_alias,
    result: row.settled ? { winnerAlias: row.winner_alias, finalAmountCents: row.final_amount_cents } : null,
    item: {
      title: row.title,
      creators: row.creators,
      creationDate: row.creation_date,
      technique: row.technique,
      type: row.item_type,
      culture: row.culture,
      measurements: row.measurements,
      image: row.image_url ? { url: row.image_url, width: row.image_width, height: row.image_height } : null,
    },
    source: {
      provider: 'Cleveland Museum of Art',
      externalId: row.external_id,
      url: row.source_url,
      license: row.license,
      fetchedAt: row.fetched_at.toISOString(),
    },
  };
}

export async function findPublicLot(db: Queryable, lotId: string): Promise<PublicLot | null> {
  const result = await db.query<PublicLotRow>(`${PUBLIC_LOT_SELECT} WHERE l.id = $1`, [lotId]);
  return result.rows[0] ? toPublicLot(result.rows[0]) : null;
}

const SHOWCASE_LIMIT = 60;

/** Vitrine: ao vivo, agendados e encerrados. Cancelados nunca aparecem. */
export async function listShowcase(db: Queryable) {
  const result = await db.query<PublicLotRow>(
    `SELECT * FROM (${PUBLIC_LOT_SELECT} WHERE l.cancelled_at IS NULL) AS lot
      ORDER BY CASE status WHEN 'live' THEN 0 WHEN 'scheduled' THEN 1 ELSE 2 END,
               CASE WHEN status = 'live' THEN ends_at END ASC,
               CASE WHEN status = 'scheduled' THEN starts_at END ASC,
               CASE WHEN status = 'ended' THEN ends_at END DESC`,
  );
  const lots = result.rows.map(toPublicLot);
  return {
    live: lots.filter((lot) => lot.status === 'live').slice(0, SHOWCASE_LIMIT),
    scheduled: lots.filter((lot) => lot.status === 'scheduled').slice(0, SHOWCASE_LIMIT),
    ended: lots.filter((lot) => lot.status === 'ended').slice(0, SHOWCASE_LIMIT),
  };
}

/**
 * Lotes do próprio leiloeiro, inclusive cancelados, com o resultado de cada um. Só o dono vê o
 * link do comprovante e o motivo de um lote vencido ainda não ter sido liquidado.
 */
export async function listSellerLots(db: Queryable, sellerId: string) {
  const result = await db.query<
    PublicLotRow & { receipt_token: string | null; issue_status: SettlementIssueStatus | null; issue_reason: string | null }
  >(
    `SELECT lot.*, rc.public_token AS receipt_token, i.status AS issue_status, i.reason AS issue_reason
       FROM (${PUBLIC_LOT_SELECT} WHERE l.seller_id = $1) AS lot
       LEFT JOIN receipts rc ON rc.lot_id = lot.id
       LEFT JOIN settlement_issues i ON i.lot_id = lot.id
      ORDER BY lot.created_at DESC`,
    [sellerId],
  );
  return result.rows.map((row) => ({
    ...toPublicLot(row),
    receiptToken: row.receipt_token,
    settlementIssue: row.issue_status
      ? { status: row.issue_status, statusLabel: SETTLEMENT_ISSUE_LABEL[row.issue_status], reason: row.issue_reason }
      : null,
  }));
}

export type ParticipationOutcome = 'leading' | 'outbid' | 'awaiting_settlement' | 'won' | 'lost';

/**
 * Participações do licitante: todo lote em que ele ofertou, com a melhor oferta dele, a posição
 * (pelo melhor lance aceito de cada participante) e o resultado. Vitórias = outcome 'won';
 * o link do comprovante só aparece para o próprio vencedor.
 */
export async function listBidderParticipations(db: Queryable, bidderId: string) {
  const result = await db.query<
    PublicLotRow & {
      my_best_cents: number;
      my_bid_count: number;
      my_last_bid_at: Date;
      position: number;
      participant_count: number;
      won: boolean;
      receipt_token: string | null;
    }
  >(
    `WITH mine AS (
       SELECT lot_id, max(amount_cents) AS my_best_cents, count(*) AS my_bid_count, max(accepted_at) AS my_last_bid_at
         FROM bids WHERE bidder_id = $1 GROUP BY lot_id
     ),
     ranking AS (
       SELECT b.lot_id, b.bidder_id,
              rank() OVER (PARTITION BY b.lot_id ORDER BY max(b.amount_cents) DESC) AS position,
              count(*) OVER (PARTITION BY b.lot_id) AS participant_count
         FROM bids b
        WHERE b.lot_id IN (SELECT lot_id FROM mine)
        GROUP BY b.lot_id, b.bidder_id
     )
     SELECT lot.*, m.my_best_cents, m.my_bid_count, m.my_last_bid_at, r.position, r.participant_count,
            coalesce(st.winner_id = $1, false) AS won,
            CASE WHEN st.winner_id = $1 THEN rc.public_token END AS receipt_token
       FROM mine m
       JOIN (${PUBLIC_LOT_SELECT} WHERE l.id IN (SELECT lot_id FROM mine)) AS lot ON lot.id = m.lot_id
       JOIN ranking r ON r.lot_id = m.lot_id AND r.bidder_id = $1
       LEFT JOIN settlements st ON st.lot_id = m.lot_id
       LEFT JOIN receipts rc ON rc.lot_id = m.lot_id
      ORDER BY m.my_last_bid_at DESC`,
    [bidderId],
  );

  const participations = result.rows.map((row) => {
    const lot = toPublicLot(row);
    let outcome: ParticipationOutcome;
    if (lot.settled) outcome = row.won ? 'won' : 'lost';
    else if (lot.status === 'ended') outcome = 'awaiting_settlement';
    else outcome = row.position === 1 ? 'leading' : 'outbid';
    return {
      lot,
      myBestBidCents: row.my_best_cents,
      myBidCount: row.my_bid_count,
      lastBidAt: row.my_last_bid_at.toISOString(),
      position: row.position,
      participantCount: row.participant_count,
      outcome,
      receiptToken: row.receipt_token,
    };
  });
  return {
    participations,
    summary: {
      total: participations.length,
      won: participations.filter((item) => item.outcome === 'won').length,
      leading: participations.filter((item) => item.outcome === 'leading').length,
    },
  };
}

/**
 * Resumo do leiloeiro. O total recebido soma SÓ os créditos de liquidação efetivamente
 * lançados na carteira; lances e reservas ainda não são receita.
 */
export async function sellerSummary(db: Queryable, sellerId: string) {
  const counts = await db.query<{ status: LotStatus; settled: boolean; total: number }>(
    `SELECT ${LOT_STATUS_SQL} AS status, (st.lot_id IS NOT NULL) AS settled, count(*) AS total
       FROM lots l
       LEFT JOIN settlements st ON st.lot_id = l.id
      WHERE l.seller_id = $1
      GROUP BY 1, 2`,
    [sellerId],
  );
  // sum() de BIGINT devolve NUMERIC (o pg entregaria texto); ::bigint volta ao tipo de centavos,
  // convertido com checagem de inteiro seguro pelo parser de BIGINT (db/pool.ts).
  const received = await db.query<{ total: number; sold: number }>(
    `SELECT coalesce(sum(amount_cents), 0)::bigint AS total, count(*) AS sold
       FROM wallet_entries
      WHERE user_id = $1 AND kind = 'settlement_credit'`,
    [sellerId],
  );

  const byStatus = { scheduled: 0, live: 0, ended: 0, cancelled: 0 };
  let awaitingSettlement = 0;
  for (const row of counts.rows) {
    byStatus[row.status] += row.total;
    if (row.status === 'ended' && !row.settled) awaitingSettlement += row.total;
  }

  // Lotes vencidos que o job não conseguiu liquidar (auditoria não ÍNTEGRA ou falha).
  const blocked = await db.query<{ total: number }>(
    `SELECT count(*) AS total FROM settlement_issues i JOIN lots l ON l.id = i.lot_id WHERE l.seller_id = $1`,
    [sellerId],
  );

  return {
    totalReceivedCents: received.rows[0].total,
    soldLots: received.rows[0].sold,
    lotsByStatus: byStatus,
    endedAwaitingSettlement: awaitingSettlement,
    settlementBlocked: blocked.rows[0].total,
  };
}
