import { Router } from 'express';
import type { Pool } from 'pg';
import { AppError } from '../../shared/errors.js';

const UUID_FORMAT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PublicLotRow = {
  id: string;
  status: 'scheduled' | 'live' | 'ended' | 'cancelled';
  starts_at: Date;
  ends_at: Date;
  starting_bid_cents: number;
  min_increment_cents: number;
  bid_count: number;
  current_bid_cents: number | null;
  seller_alias: string;
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
  server_time: Date;
};

/**
 * Detalhe público de um lote. Lê SÓ o banco local (lote + snapshot): funciona com a API
 * do museu fora do ar. O status é calculado pelo relógio do PostgreSQL.
 */
export function createPublicLotsRouter(pool: Pool) {
  const router = Router();

  router.get('/lots/:id', async (req, res) => {
    const { id } = req.params;
    if (!UUID_FORMAT.test(id)) throw new AppError(404, 'NOT_FOUND', 'Lote não encontrado.');

    const result = await pool.query<PublicLotRow>(
      `SELECT l.id,
              CASE
                WHEN l.cancelled_at IS NOT NULL THEN 'cancelled'
                WHEN now() < l.starts_at THEN 'scheduled'
                WHEN now() < l.ends_at THEN 'live'
                ELSE 'ended'
              END AS status,
              l.starts_at, l.ends_at, l.starting_bid_cents, l.min_increment_cents, l.bid_count,
              leader.amount_cents AS current_bid_cents,
              seller.public_alias AS seller_alias,
              s.title, s.creators, s.creation_date, s.technique, s.item_type, s.culture, s.measurements,
              s.image_url, s.image_width, s.image_height, s.source_url, s.license, s.external_id, s.fetched_at,
              now() AS server_time
         FROM lots l
         JOIN item_snapshots s ON s.id = l.snapshot_id
         JOIN users seller ON seller.id = l.seller_id
         LEFT JOIN bids leader ON leader.id = l.leader_bid_id
        WHERE l.id = $1`,
      [id],
    );
    const lot = result.rows[0];
    if (!lot) throw new AppError(404, 'NOT_FOUND', 'Lote não encontrado.');

    res.json({
      lot: {
        id: lot.id,
        status: lot.status,
        startsAt: lot.starts_at.toISOString(),
        endsAt: lot.ends_at.toISOString(),
        startingBidCents: lot.starting_bid_cents,
        minIncrementCents: lot.min_increment_cents,
        currentBidCents: lot.current_bid_cents,
        nextMinimumBidCents:
          lot.current_bid_cents === null ? lot.starting_bid_cents : lot.current_bid_cents + lot.min_increment_cents,
        bidCount: lot.bid_count,
        sellerAlias: lot.seller_alias,
        item: {
          title: lot.title,
          creators: lot.creators,
          creationDate: lot.creation_date,
          technique: lot.technique,
          type: lot.item_type,
          culture: lot.culture,
          measurements: lot.measurements,
          image: lot.image_url ? { url: lot.image_url, width: lot.image_width, height: lot.image_height } : null,
        },
        source: {
          provider: 'Cleveland Museum of Art',
          externalId: lot.external_id,
          url: lot.source_url,
          license: lot.license,
          fetchedAt: lot.fetched_at.toISOString(),
        },
      },
      serverTime: lot.server_time.toISOString(),
    });
  });

  return router;
}
