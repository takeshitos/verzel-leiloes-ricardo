import type { Pool, PoolClient } from 'pg';

/** Cliente emprestado pela transação. Toda consulta da transação usa este objeto. */
export type TransactionClient = PoolClient;

// Deadlock (40P01) e falha de serialização (40001): o PostgreSQL desfez a transação
// e é seguro tentar de novo do zero.
const RETRYABLE_SQLSTATES = new Set(['40P01', '40001']);
const MAX_ATTEMPTS = 3;

function isRetryable(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    RETRYABLE_SQLSTATES.has(String((error as { code: unknown }).code))
  );
}

/**
 * Executa `work` dentro de BEGIN/COMMIT usando UM cliente do pool.
 *
 * - Todas as consultas da transação devem usar o `client` recebido, nunca `pool.query`.
 * - Qualquer erro faz ROLLBACK; o cliente é sempre devolvido ao pool no `finally`.
 * - Deadlock ou falha de serialização: repete do início, até 3 tentativas.
 * - Não faça I/O externo (HTTP, âncora, sockets) dentro de `work`: isso acontece depois do commit.
 */
export async function withTransaction<T>(
  pool: Pool,
  work: (client: TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const client = await pool.connect();
    let brokenConnection: Error | undefined;

    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        // Se nem o ROLLBACK funciona, a conexão está quebrada: descartar em vez de reutilizar.
        brokenConnection = rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError));
      }

      if (isRetryable(error) && attempt < MAX_ATTEMPTS) {
        continue;
      }
      throw error;
    } finally {
      client.release(brokenConnection);
    }
  }
}
