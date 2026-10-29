import type { Pool } from 'pg';
import { AppError } from '../../shared/errors.js';
import { withIdempotency, type IdempotentResponse } from '../../shared/idempotency.js';
import { formatBrl, MAX_WALLET_TOTAL_CENTS } from '../../shared/money.js';
import { publishWalletChanged } from '../realtime/events.js';
import { lockWallets, readBalance, type WalletBalance } from './ledger.js';

export type WalletEntry = {
  kind: 'deposit' | 'settlement_debit' | 'settlement_credit';
  amountCents: number;
  lotId: string | null;
  createdAt: string;
};

export type WalletView = WalletBalance & { simulated: true; recentEntries: WalletEntry[] };

export type DepositResponse = {
  deposit: { amountCents: number; createdAt: string; simulated: true };
  wallet: WalletBalance;
};

/** Carteira do próprio usuário: saldo e últimos lançamentos. */
export async function getWallet(pool: Pool, userId: string): Promise<WalletView> {
  const balance = await readBalance(pool, userId);
  const entries = await pool.query<{ kind: WalletEntry['kind']; amount_cents: number; lot_id: string | null; created_at: Date }>(
    `SELECT kind, amount_cents, lot_id, created_at
       FROM wallet_entries WHERE user_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT 20`,
    [userId],
  );
  return {
    ...balance,
    simulated: true,
    recentEntries: entries.rows.map((row) => ({
      kind: row.kind,
      amountCents: row.amount_cents,
      lotId: row.lot_id,
      createdAt: row.created_at.toISOString(),
    })),
  };
}

/**
 * Depósito SIMULADO (sem gateway, cartão ou dinheiro real). Numa única transação:
 * registra a chave de idempotência, bloqueia a carteira, grava o lançamento e soma no total.
 */
export async function deposit(
  pool: Pool,
  userId: string,
  amountCents: number,
  idempotencyKey: string,
): Promise<IdempotentResponse<DepositResponse>> {
  const result = await withIdempotency<DepositResponse>(
    pool,
    { userId, scope: 'wallet.deposit', key: idempotencyKey, request: { amountCents } },
    async (client) => {
      const wallets = await lockWallets(client, [userId]);
      const currentTotal = wallets.get(userId)!.totalCents;
      if (currentTotal + amountCents > MAX_WALLET_TOTAL_CENTS) {
        throw new AppError(
          422,
          'WALLET_LIMIT_EXCEEDED',
          `O saldo simulado pode ser no máximo ${formatBrl(MAX_WALLET_TOTAL_CENTS)}.`,
        );
      }

      const entry = await client.query<{ created_at: Date }>(
        `INSERT INTO wallet_entries (user_id, kind, amount_cents, operation_key)
         VALUES ($1, 'deposit', $2, $3)
         RETURNING created_at`,
        [userId, amountCents, `deposit:${userId}:${idempotencyKey}`],
      );
      await client.query('UPDATE wallets SET total_cents = total_cents + $2, updated_at = now() WHERE user_id = $1', [
        userId,
        amountCents,
      ]);

      return {
        status: 201,
        body: {
          deposit: { amountCents, createdAt: entry.rows[0].created_at.toISOString(), simulated: true },
          wallet: await readBalance(client, userId),
        },
      };
    },
  );
  // Depois do COMMIT. Repetição idempotente não mudou nada e não avisa de novo.
  if (!result.replayed) publishWalletChanged({ userId });
  return result;
}
