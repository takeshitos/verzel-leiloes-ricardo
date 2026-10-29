import type { Pool } from 'pg';
import { withTransaction } from '../../db/transaction.js';
import { AppError } from '../../shared/errors.js';
import type { CatalogClient } from '../catalog/client.js';
import { fetchItemForLot, upsertSnapshot } from '../catalog/snapshots.js';
import { publishLotChanged } from '../realtime/events.js';
import { findPublicLot, type PublicLot } from './queries.js';

const MINUTE_MS = 60_000;
const MIN_DURATION_MS = 2 * MINUTE_MS;
const MAX_DURATION_MS = 30 * 24 * 60 * MINUTE_MS;
// Tolerância para relógio do navegador um pouco atrasado ao escolher "começar agora".
const START_PAST_TOLERANCE_MS = 5 * MINUTE_MS;
const MAX_START_AHEAD_MS = 90 * 24 * 60 * MINUTE_MS;

export type CreateLotInput = {
  externalId: string;
  startingBidCents: number;
  minIncrementCents: number;
  startsAt: Date;
  endsAt: Date;
};

function invalidField(field: string, message: string): AppError {
  return new AppError(400, 'VALIDATION_ERROR', 'Dados inválidos. Confira os campos.', { fields: { [field]: message } });
}

/** Regras de datas, comparadas com o relógio do banco (o mesmo que valida lances). */
function validateSchedule(input: CreateLotInput, now: Date): void {
  if (input.startsAt.getTime() < now.getTime() - START_PAST_TOLERANCE_MS) {
    throw invalidField('startsAt', 'O início não pode estar no passado.');
  }
  if (input.startsAt.getTime() > now.getTime() + MAX_START_AHEAD_MS) {
    throw invalidField('startsAt', 'O início pode ser no máximo 90 dias à frente.');
  }
  const duration = input.endsAt.getTime() - input.startsAt.getTime();
  if (duration < MIN_DURATION_MS) {
    throw invalidField('endsAt', 'O fim precisa ser pelo menos 2 minutos depois do início.');
  }
  if (duration > MAX_DURATION_MS) {
    throw invalidField('endsAt', 'O leilão pode durar no máximo 30 dias.');
  }
}

/**
 * Cria um lote. O leiloeiro informa só o id da obra; os dados dela vêm da API do museu
 * (buscados fora da transação) e viram um snapshot local. O dono vem da sessão.
 */
export async function createLot(
  pool: Pool,
  catalog: CatalogClient,
  sellerId: string,
  input: CreateLotInput,
): Promise<PublicLot> {
  const item = await fetchItemForLot(catalog, input.externalId);

  const lotId = await withTransaction(pool, async (client) => {
    const { rows } = await client.query<{ now: Date }>('SELECT clock_timestamp() AS now');
    validateSchedule(input, rows[0].now);

    const snapshotId = await upsertSnapshot(client, item);
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO lots (seller_id, snapshot_id, starting_bid_cents, min_increment_cents,
                         starts_at, original_ends_at, ends_at)
       VALUES ($1, $2, $3, $4, $5, $6, $6)
       RETURNING id`,
      [sellerId, snapshotId, input.startingBidCents, input.minIncrementCents, input.startsAt, input.endsAt],
    );
    return inserted.rows[0].id;
  });

  const lot = await findPublicLot(pool, lotId);
  return lot!;
}

/**
 * Cancela um lote sem lances. Tudo é conferido DEPOIS de bloquear a linha do lote
 * (FOR UPDATE), que é o mesmo bloqueio que um lance usa: se um lance chegar ao mesmo
 * tempo, um espera o outro e só um vence. O banco também impede cancelar lote com lance.
 */
export async function cancelLot(pool: Pool, sellerId: string, lotId: string): Promise<PublicLot> {
  await withTransaction(pool, async (client) => {
    const locked = await client.query<{
      seller_id: string;
      cancelled_at: Date | null;
      bid_count: number;
      ends_at: Date;
      now: Date;
    }>(
      `SELECT seller_id, cancelled_at, bid_count, ends_at, clock_timestamp() AS now
         FROM lots WHERE id = $1 FOR UPDATE`,
      [lotId],
    );
    const lot = locked.rows[0];
    if (!lot) throw new AppError(404, 'NOT_FOUND', 'Lote não encontrado.');
    if (lot.seller_id !== sellerId) {
      throw new AppError(403, 'FORBIDDEN', 'Você só pode gerenciar os seus próprios lotes.');
    }
    if (lot.cancelled_at) {
      throw new AppError(409, 'LOT_ALREADY_CANCELLED', 'Este lote já foi cancelado.');
    }
    if (lot.bid_count > 0) {
      throw new AppError(409, 'LOT_HAS_BIDS', 'Não é possível cancelar: o lote já recebeu lances.');
    }
    if (lot.now >= lot.ends_at) {
      throw new AppError(409, 'LOT_ENDED', 'Não é possível cancelar um lote já encerrado.');
    }

    await client.query('UPDATE lots SET cancelled_at = $2, version = version + 1 WHERE id = $1', [lotId, lot.now]);
  });
  // Depois do COMMIT: quem está na sala vê o lote cancelado sem recarregar.
  publishLotChanged({ lotId });

  const lot = await findPublicLot(pool, lotId);
  return lot!;
}
