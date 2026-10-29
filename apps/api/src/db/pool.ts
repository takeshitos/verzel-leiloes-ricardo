import pg from 'pg';
import type { Pool } from 'pg';

// Por padrão o pg devolve BIGINT (OID 20) como string. Aqui convertemos para number,
// mas só se o valor couber exatamente num inteiro do JavaScript. Centavos acima de
// Number.MAX_SAFE_INTEGER (~90 trilhões de reais) seriam um erro, nunca um arredondamento.
// Atenção: sum() de BIGINT devolve NUMERIC, que continua vindo como texto. Em somas de
// centavos, use sum(...)::bigint no SQL.
const BIGINT_OID = 20;
pg.types.setTypeParser(BIGINT_OID, (value: string) => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`Valor BIGINT fora do intervalo seguro do JavaScript: ${value}`);
  }
  return parsed;
});

export type PoolOptions = {
  databaseUrl: string;
  maxConnections?: number;
};

export function createPool({ databaseUrl, maxConnections = 10 }: PoolOptions): Pool {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: maxConnections,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    application_name: 'verzel-leiloes-api',
  });

  // Erro numa conexão ociosa (ex.: banco reiniciou) não pode derrubar o processo.
  pool.on('error', (error) => {
    console.error(`[banco] erro em conexão ociosa: ${error.message}`);
  });

  return pool;
}
