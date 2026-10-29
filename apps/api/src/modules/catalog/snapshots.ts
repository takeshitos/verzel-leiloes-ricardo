import type { Pool, PoolClient } from 'pg';
import { AppError } from '../../shared/errors.js';
import type { CatalogClient } from './client.js';
import type { ItemSnapshotInput } from './cma.js';

/**
 * Busca no museu a obra escolhida para um lote. O cliente informa só o id externo;
 * título, imagem e atributos vêm da API, nunca do corpo da requisição.
 * Chame FORA da transação (é I/O externo); depois grave com upsertSnapshot dentro dela.
 */
export async function fetchItemForLot(catalog: CatalogClient, externalId: string): Promise<ItemSnapshotInput> {
  const result = await catalog.getItem(externalId);
  if (!result) {
    throw new AppError(404, 'CATALOG_ITEM_NOT_FOUND', 'Obra não encontrada no catálogo do museu.');
  }
  if (!result.item.imageUrl) {
    throw new AppError(422, 'CATALOG_ITEM_WITHOUT_IMAGE', 'Esta obra não tem imagem disponível. Escolha outra.');
  }
  return result.item;
}

/**
 * Grava o snapshot se ainda não existir (mesmo provedor, id e momento da coleta). Devolve o id.
 * A partir daí, vitrine, sala, auditoria e comprovante leem só esta cópia local.
 */
export async function upsertSnapshot(db: Pool | PoolClient, snapshot: ItemSnapshotInput): Promise<string> {
  const inserted = await db.query<{ id: string }>(
    `INSERT INTO item_snapshots (
       provider, external_id, accession_number, title, creators, creation_date, technique,
       item_type, culture, measurements, image_url, image_width, image_height, source_url,
       license, raw, fetched_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
     ON CONFLICT (provider, external_id, fetched_at) DO NOTHING
     RETURNING id`,
    [
      snapshot.provider,
      snapshot.externalId,
      snapshot.accessionNumber,
      snapshot.title,
      snapshot.creators,
      snapshot.creationDate,
      snapshot.technique,
      snapshot.itemType,
      snapshot.culture,
      snapshot.measurements,
      snapshot.imageUrl,
      snapshot.imageWidth,
      snapshot.imageHeight,
      snapshot.sourceUrl,
      snapshot.license,
      JSON.stringify(snapshot.raw),
      snapshot.fetchedAt,
    ],
  );
  if (inserted.rows[0]) return inserted.rows[0].id;

  const existing = await db.query<{ id: string }>(
    'SELECT id FROM item_snapshots WHERE provider = $1 AND external_id = $2 AND fetched_at = $3',
    [snapshot.provider, snapshot.externalId, snapshot.fetchedAt],
  );
  return existing.rows[0].id;
}
