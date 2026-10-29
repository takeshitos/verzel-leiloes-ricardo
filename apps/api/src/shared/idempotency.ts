import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { withTransaction, type TransactionClient } from '../db/transaction.js';
import { AppError } from './errors.js';

/**
 * Idempotência de operações que movimentam dinheiro (depósito agora; lance na etapa 09).
 *
 * O navegador gera uma chave (cabeçalho Idempotency-Key) para cada ação do usuário e a
 * repete se a rede falhar. Funcionamento, tudo na MESMA transação da operação:
 *  1. INSERT da chave em idempotency_keys (ON CONFLICT DO NOTHING).
 *     - Se outra requisição com a mesma chave estiver em andamento, o PostgreSQL faz esta
 *       esperar o fim daquela (índice único). Não há janela para executar duas vezes.
 *  2. Chave nova: executa a operação e grava a resposta junto, no mesmo COMMIT.
 *  3. Chave já usada: com o mesmo corpo, devolve a resposta guardada (sem repetir o efeito);
 *     com corpo diferente, 409 IDEMPOTENCY_KEY_REUSED.
 * Se a operação falhar (ex.: limite excedido), tudo é desfeito, inclusive a chave:
 * repetir a mesma chave tenta de novo, o que é seguro porque nada aconteceu.
 */

const KEY_FORMAT = /^[A-Za-z0-9_-]{8,128}$/;

export type IdempotentResponse<T> = { status: number; body: T; replayed: boolean };

/** Lê e valida o cabeçalho Idempotency-Key. */
export function requireIdempotencyKey(headerValue: string | undefined): string {
  if (!headerValue) {
    throw new AppError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Envie o cabeçalho Idempotency-Key (um identificador único por ação).');
  }
  if (!KEY_FORMAT.test(headerValue)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Idempotency-Key inválida: use de 8 a 128 letras, números, "-" ou "_".');
  }
  return headerValue;
}

/** Impressão digital do pedido: SHA-256 do JSON com as chaves em ordem alfabética. */
export function requestFingerprint(request: Record<string, unknown>): string {
  const canonical = JSON.stringify(Object.fromEntries(Object.entries(request).sort(([a], [b]) => a.localeCompare(b))));
  return createHash('sha256').update(canonical).digest('hex');
}

export async function withIdempotency<T>(
  pool: Pool,
  params: { userId: string; scope: string; key: string; request: Record<string, unknown> },
  work: (client: TransactionClient) => Promise<{ status: number; body: T }>,
): Promise<IdempotentResponse<T>> {
  const fingerprint = requestFingerprint(params.request);

  return withTransaction(pool, async (client) => {
    const claimed = await client.query(
      `INSERT INTO idempotency_keys (user_id, scope, key, request_fingerprint, response_status, response_body)
       VALUES ($1, $2, $3, $4, 0, '{}')
       ON CONFLICT (user_id, scope, key) DO NOTHING
       RETURNING key`,
      [params.userId, params.scope, params.key, fingerprint],
    );

    if (claimed.rowCount === 0) {
      const stored = await client.query<{ request_fingerprint: string; response_status: number; response_body: T }>(
        `SELECT request_fingerprint, response_status, response_body
           FROM idempotency_keys WHERE user_id = $1 AND scope = $2 AND key = $3`,
        [params.userId, params.scope, params.key],
      );
      const previous = stored.rows[0];
      if (previous.request_fingerprint !== fingerprint) {
        throw new AppError(
          409,
          'IDEMPOTENCY_KEY_REUSED',
          'Esta chave de operação já foi usada com outros dados. Gere uma nova chave para uma nova ação.',
        );
      }
      return { status: previous.response_status, body: previous.response_body, replayed: true };
    }

    const result = await work(client);
    // A resposta devolvida agora é a mesma gravada (JSONB reordena as chaves): assim a primeira
    // resposta e as repetições ficam idênticas, byte a byte.
    const saved = await client.query<{ response_body: T }>(
      `UPDATE idempotency_keys SET response_status = $4, response_body = $5
        WHERE user_id = $1 AND scope = $2 AND key = $3
        RETURNING response_body`,
      [params.userId, params.scope, params.key, result.status, JSON.stringify(result.body)],
    );
    return { status: result.status, body: saved.rows[0].response_body, replayed: false };
  });
}
