import type { Pool } from 'pg';
import { describeError } from '../../shared/describe-error.js';
import { formatBrl } from '../../shared/money.js';
import { databaseClock, type Clock } from '../bids/service.js';
import {
  recordSettlementIssue,
  settleLot,
  SettlementInconsistencyError,
  type AuditGate,
  type SettleOutcome,
} from './service.js';

/**
 * Encerramento automático no backend. Não depende de navegador aberto nem de um timer por lote:
 * a cada ciclo procura no banco os lotes vencidos, não cancelados e sem liquidação, e tenta
 * liquidar cada um. Roda no startup (recupera o que venceu com o servidor parado) e depois a
 * cada intervalo. Repetir, reiniciar ou rodar dois servidores ao mesmo tempo não duplica nada:
 * quem decide é a transação de settleLot, com o lote bloqueado.
 */

export type SettlementCycleSummary = { checked: number; settled: number; blocked: number; failed: number };

const BATCH_SIZE = 50;

export function createSettlementJob({ pool, audit, clock = databaseClock }: { pool: Pool; audit: AuditGate; clock?: Clock }) {
  /**
   * Lotes vencidos ainda sem liquidação. Os nunca tentados vêm primeiro e depois os que estão
   * há mais tempo sem nova tentativa: um lote travado (ex.: adulterado) não bloqueia os outros.
   */
  async function findDueLots(): Promise<string[]> {
    const client = await pool.connect();
    try {
      const now = await clock(client);
      const result = await client.query<{ id: string }>(
        `SELECT l.id
           FROM lots l
           LEFT JOIN settlement_issues i ON i.lot_id = l.id
          WHERE l.cancelled_at IS NULL
            AND l.ends_at <= $1
            AND NOT EXISTS (SELECT 1 FROM settlements s WHERE s.lot_id = l.id)
          ORDER BY i.updated_at ASC NULLS FIRST, l.ends_at, l.id
          LIMIT $2`,
        [now, BATCH_SIZE],
      );
      return result.rows.map((row) => row.id);
    } finally {
      client.release();
    }
  }

  function logOutcome(outcome: SettleOutcome): void {
    if (outcome.result === 'settled') {
      const result = outcome.winnerAlias
        ? `vencedor ${outcome.winnerAlias}, ${formatBrl(outcome.amountCents ?? 0)}`
        : 'sem lances, sem vencedor';
      console.log(`[liquidação] Lote ${outcome.lotId} liquidado: ${result}.`);
    } else if (outcome.result === 'blocked' && outcome.changed) {
      // Só quando o motivo muda, para não repetir a mesma linha a cada ciclo.
      console.warn(`[liquidação] Lote ${outcome.lotId} NÃO liquidado (${outcome.status}): ${outcome.reason}`);
    }
  }

  /** Um ciclo completo. Erro num lote não impede os outros. */
  async function runOnce(): Promise<SettlementCycleSummary> {
    const summary: SettlementCycleSummary = { checked: 0, settled: 0, blocked: 0, failed: 0 };
    for (const lotId of await findDueLots()) {
      summary.checked++;
      try {
        const outcome = await settleLot(pool, lotId, { audit, clock });
        logOutcome(outcome);
        if (outcome.result === 'settled') summary.settled++;
        if (outcome.result === 'blocked') summary.blocked++;
      } catch (error) {
        summary.failed++;
        // A transação foi desfeita inteira. A razão gravada não traz detalhes internos;
        // o detalhe técnico fica só no log do servidor.
        const reason =
          error instanceof SettlementInconsistencyError
            ? error.message
            : 'Falha inesperada na transação de liquidação. Nada foi alterado; nova tentativa no próximo ciclo.';
        console.error(`[liquidação] Falha ao liquidar o lote ${lotId}: ${describeError(error)}`);
        try {
          logOutcome(await recordSettlementIssue(pool, lotId, 'failed', reason, clock));
        } catch (recordError) {
          console.error(`[liquidação] Não foi possível registrar a pendência do lote ${lotId}: ${describeError(recordError)}`);
        }
      }
    }
    return summary;
  }

  /** Roda agora (recuperação no startup) e depois a cada `intervalMs`. Devolve a função que para. */
  function start(intervalMs: number): () => void {
    let running = false;
    const tick = async () => {
      if (running) return; // ciclo anterior ainda rodando: não sobrepõe
      running = true;
      try {
        await runOnce();
      } catch (error) {
        console.error(`[liquidação] Falha no ciclo: ${describeError(error)}`);
      } finally {
        running = false;
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), intervalMs);
    timer.unref();
    return () => clearInterval(timer);
  }

  return { runOnce, start, findDueLots };
}
