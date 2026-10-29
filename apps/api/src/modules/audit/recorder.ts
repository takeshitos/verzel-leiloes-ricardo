import type { TransactionClient } from '../../db/transaction.js';
import { bidderRef, bidHash, genesisHash, type GenesisInput } from './chain.js';

/**
 * Contrato do componente de integridade usado pelo serviço de lances.
 * A implementação (assinatura, checkpoint e âncora) está em service.ts.
 */

export type AnchorStatus = 'pending' | 'confirmed';

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
  /** Dentro da transação do lance, com o lote bloqueado: calcula a cadeia. Sem I/O externo. */
  prepareBid(client: TransactionClient, input: RecordBidInput): Promise<RecordedBidIntegrity>;
  /** Dentro da transação, depois de gravar o lance: assina e grava o checkpoint 'pending'. */
  afterBidInserted(client: TransactionClient, input: RecordBidInput, integrity: RecordedBidIntegrity): Promise<void>;
  /** Depois do COMMIT: grava na âncora. Devolve se o checkpoint ficou confirmado. */
  afterCommit(lotId: string, bidCount: number): Promise<AnchorStatus>;
}

/** Cálculo da cadeia para o próximo lance (lido com o lote bloqueado). */
export async function computeBidChain(client: TransactionClient, input: RecordBidInput): Promise<RecordedBidIntegrity> {
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
}
