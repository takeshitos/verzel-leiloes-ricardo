import type { TransactionClient } from '../../db/transaction.js';
import { bidderRef, bidHash, genesisHash, type GenesisInput } from './chain.js';

/**
 * CONTRATO do componente de integridade, usado pelo serviço de lances.
 *
 * Etapa 09 (agora): calcula a cadeia de hashes REAL dentro da transação do lance.
 * Etapa 10: o mesmo contrato passa a assinar o checkpoint (Ed25519, chave fora do banco),
 * gravar audit_checkpoints como 'pending' na transação e, depois do commit, gravar na
 * âncora independente e marcar 'confirmed'.
 *
 * Enquanto a etapa 10 não existir, todo lance fica com auditStatus 'pending'. R13 NÃO está
 * concluído: sem checkpoint assinado e âncora, quem edita o banco pode recalcular a cadeia.
 */

export type AuditStatus = 'pending' | 'confirmed';

export type RecordBidInput = {
  lot: GenesisInput & { bidCount: number };
  bidId: string;
  seq: number;
  bidderId: string;
  alias: string;
  amountCents: number;
  acceptedAt: Date;
};

export type RecordedBidIntegrity = {
  bidderRef: string;
  prevHash: string;
  hash: string;
};

export interface IntegrityRecorder {
  /** Dentro da transação do lance, com o lote bloqueado. Não faz I/O externo. */
  prepareBid(client: TransactionClient, input: RecordBidInput): Promise<RecordedBidIntegrity>;
  /** Dentro da transação, depois de gravar o lance (etapa 10: checkpoint assinado 'pending'). */
  afterBidInserted(client: TransactionClient, input: RecordBidInput, integrity: RecordedBidIntegrity): Promise<void>;
  /** Depois do COMMIT (etapa 10: grava na âncora). Devolve o estado da auditoria do lance. */
  afterCommit(lotId: string, bidCount: number): Promise<AuditStatus>;
}

/** Implementação da etapa 09: cadeia real, sem checkpoint nem âncora (auditoria pendente). */
export const chainOnlyRecorder: IntegrityRecorder = {
  async prepareBid(client, input) {
    const prevHash =
      input.seq === 1
        ? genesisHash(input.lot)
        : (
            await client.query<{ hash: string }>('SELECT hash FROM bids WHERE lot_id = $1 AND seq = $2', [
              input.lot.lotId,
              input.seq - 1,
            ])
          ).rows[0].hash;

    const ref = bidderRef(input.bidderId, input.lot.lotId);
    const hash = bidHash(prevHash, {
      lotId: input.lot.lotId,
      seq: input.seq,
      bidId: input.bidId,
      bidderRef: ref,
      alias: input.alias,
      amountCents: input.amountCents,
      acceptedAt: input.acceptedAt,
    });
    return { bidderRef: ref, prevHash, hash };
  },

  async afterBidInserted() {
    // Etapa 10: assinar e gravar o checkpoint (lot_id, bid_count, last_hash) como 'pending'.
  },

  async afterCommit() {
    // Etapa 10: gravar na âncora independente e devolver 'confirmed' se der certo.
    return 'pending';
  },
};
