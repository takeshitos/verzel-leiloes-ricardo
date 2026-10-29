import { EventEmitter } from 'node:events';

/**
 * Eventos de domínio, emitidos SÓ DEPOIS do COMMIT (bid.accepted e lot.closed). A etapa 12 liga o Socket.IO aqui:
 * a parte pública vai para a sala do lote; a privada (ids) decide quem recebe saldo e aviso
 * de "você foi superado". Nenhum evento é a fonte da verdade: o banco é.
 */

export type BidAcceptedEvent = {
  // Público
  lotId: string;
  version: number;
  seq: number;
  alias: string;
  amountCents: number;
  acceptedAt: string;
  endsAt: string;
  extended: boolean;
  nextMinimumBidCents: number;
  auditStatus: 'pending' | 'confirmed';
  // Privado (nunca enviar em sala pública)
  bidderId: string;
  previousLeaderId: string | null;
};

const emitter = new EventEmitter();

export function publishBidAccepted(event: BidAcceptedEvent): void {
  emitter.emit('bid.accepted', event);
}

export function onBidAccepted(listener: (event: BidAcceptedEvent) => void): () => void {
  emitter.on('bid.accepted', listener);
  return () => emitter.off('bid.accepted', listener);
}

/** Lote liquidado (com ou sem vencedor). Emitido só depois do COMMIT da liquidação. */
export type LotClosedEvent = {
  // Público
  lotId: string;
  version: number;
  settledAt: string;
  winnerAlias: string | null;
  finalAmountCents: number | null;
  // Privado (nunca enviar em sala pública): só o vencedor e o vendedor recebem o link do comprovante.
  winnerId: string | null;
  sellerId: string;
  receiptToken: string | null;
};

export function publishLotClosed(event: LotClosedEvent): void {
  emitter.emit('lot.closed', event);
}

export function onLotClosed(listener: (event: LotClosedEvent) => void): () => void {
  emitter.on('lot.closed', listener);
  return () => emitter.off('lot.closed', listener);
}
