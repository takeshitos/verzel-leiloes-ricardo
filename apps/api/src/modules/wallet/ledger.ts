import type { Pool, PoolClient } from 'pg';

/**
 * Regras centrais da carteira, usadas por depósito, lance (etapa 09) e liquidação (etapa 11).
 *
 * PROTOCOLO DE BLOQUEIO (o mesmo em todas as operações, para não haver deadlock):
 *   1. se a operação envolve um lote: bloquear a linha do lote primeiro (FOR UPDATE);
 *   2. depois, bloquear TODAS as carteiras envolvidas com lockWallets, que as bloqueia
 *      em ordem crescente de user_id.
 * Toda operação que altera o total ou as reservas de alguém passa por lockWallets.
 *
 * SALDO:
 *   total        = wallets.total_cents (só muda com depósito e liquidação)
 *   comprometido = soma das reservas ativas do usuário, em TODOS os lotes
 *   disponível   = total - comprometido
 */

type Queryable = Pool | PoolClient;

export type WalletBalance = {
  totalCents: number;
  committedCents: number;
  availableCents: number;
};

/** Bloqueia as carteiras (FOR UPDATE) em ordem crescente de user_id. Use dentro de withTransaction. */
export async function lockWallets(client: PoolClient, userIds: string[]): Promise<Map<string, { totalCents: number }>> {
  const ids = [...new Set(userIds)].sort();
  const result = await client.query<{ user_id: string; total_cents: number }>(
    `SELECT user_id, total_cents FROM wallets
      WHERE user_id = ANY($1::uuid[])
      ORDER BY user_id
      FOR UPDATE`,
    [ids],
  );
  if (result.rowCount !== ids.length) {
    throw new Error('Carteira não encontrada para um dos usuários.');
  }
  return new Map(result.rows.map((row) => [row.user_id, { totalCents: row.total_cents }]));
}

/**
 * Total, comprometido e disponível numa única consulta (um mesmo instante do banco).
 * Dentro de uma transação com a carteira bloqueada, o valor é definitivo.
 */
export async function readBalance(db: Queryable, userId: string): Promise<WalletBalance> {
  const result = await db.query<{ total_cents: number; committed_cents: number }>(
    `SELECT w.total_cents,
            (SELECT coalesce(sum(r.amount_cents), 0)::bigint
               FROM reservations r WHERE r.bidder_id = w.user_id) AS committed_cents
       FROM wallets w
      WHERE w.user_id = $1`,
    [userId],
  );
  const row = result.rows[0];
  if (!row) throw new Error('Carteira não encontrada.');
  return {
    totalCents: row.total_cents,
    committedCents: row.committed_cents,
    availableCents: row.total_cents - row.committed_cents,
  };
}
