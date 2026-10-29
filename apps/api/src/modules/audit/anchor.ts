import pg from 'pg';
import { describeError } from '../../shared/describe-error.js';

/**
 * Adaptador da âncora independente: um PostgreSQL SEPARADO do principal, com credencial
 * própria e tabela só de inserção (migrations-anchor). Timeout curto: âncora lenta ou fora
 * do ar não pode travar lances; vira "pendente".
 */

export type AnchorEntry = {
  lotId: string;
  bidCount: number;
  lastHash: string;
  signature: string;
  keyVersion: number;
};

export class AnchorUnavailableError extends Error {
  constructor(reason: string) {
    super(`Âncora indisponível: ${reason}`);
    this.name = 'AnchorUnavailableError';
  }
}

export type AnchorStore = {
  /** Grava (idempotente). 'stored': a âncora tem exatamente esta entrada. 'conflict': tem outra. */
  append(entry: AnchorEntry): Promise<'stored' | 'conflict'>;
  entriesForLot(lotId: string): Promise<AnchorEntry[]>;
  lotIds(): Promise<string[]>;
  close(): Promise<void>;
};

type AnchorRow = { lot_id: string; bid_count: number; last_hash: string; signature: string; key_version: number };

const toEntry = (row: AnchorRow): AnchorEntry => ({
  lotId: row.lot_id,
  bidCount: row.bid_count,
  lastHash: row.last_hash,
  signature: row.signature,
  keyVersion: row.key_version,
});

export function createAnchorStore({ databaseUrl, timeoutMs }: { databaseUrl: string; timeoutMs: number }): AnchorStore {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 3,
    connectionTimeoutMillis: timeoutMs,
    query_timeout: timeoutMs,
    idleTimeoutMillis: 10_000,
    allowExitOnIdle: true,
    application_name: 'verzel-leiloes-ancora',
  });
  pool.on('error', (error) => console.error(`[âncora] erro em conexão ociosa: ${error.message}`));

  async function query<T extends pg.QueryResultRow>(sql: string, params: unknown[] = []): Promise<pg.QueryResult<T>> {
    try {
      return await pool.query<T>(sql, params);
    } catch (error) {
      throw new AnchorUnavailableError(describeError(error));
    }
  }

  return {
    async append(entry) {
      await query(
        `INSERT INTO anchor_entries (lot_id, bid_count, last_hash, signature, key_version)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (lot_id, bid_count) DO NOTHING`,
        [entry.lotId, entry.bidCount, entry.lastHash, entry.signature, entry.keyVersion],
      );
      const stored = await query<AnchorRow>('SELECT * FROM anchor_entries WHERE lot_id = $1 AND bid_count = $2', [
        entry.lotId,
        entry.bidCount,
      ]);
      const row = stored.rows[0];
      const same =
        row && row.last_hash === entry.lastHash && row.signature === entry.signature && row.key_version === entry.keyVersion;
      return same ? 'stored' : 'conflict';
    },

    async entriesForLot(lotId) {
      const result = await query<AnchorRow>('SELECT * FROM anchor_entries WHERE lot_id = $1 ORDER BY bid_count', [lotId]);
      return result.rows.map(toEntry);
    },

    async lotIds() {
      const result = await query<{ lot_id: string }>('SELECT DISTINCT lot_id FROM anchor_entries');
      return result.rows.map((row) => row.lot_id);
    },

    close() {
      return pool.end();
    },
  };
}

/** Usada quando ANCHOR_DATABASE_URL não está configurada: tudo fica pendente/indisponível. */
export const missingAnchor: AnchorStore = {
  async append() {
    throw new AnchorUnavailableError('ANCHOR_DATABASE_URL não configurada');
  },
  async entriesForLot() {
    throw new AnchorUnavailableError('ANCHOR_DATABASE_URL não configurada');
  },
  async lotIds() {
    throw new AnchorUnavailableError('ANCHOR_DATABASE_URL não configurada');
  },
  async close() {},
};
