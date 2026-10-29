import { EventEmitter } from 'node:events';

/**
 * Eventos de domínio, emitidos SÓ DEPOIS do COMMIT. O Socket.IO (realtime/socket.ts) escuta
 * estes eventos e os projeta para as salas: a parte pública vai para a sala do lote; a privada
 * (ids) só decide quem recebe saldo e avisos pessoais. Nenhum evento é a fonte da verdade:
 * o banco é, e o cliente sempre pode recuperar o estado por HTTP.
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

/** Lote alterado fora de lance e liquidação (ex.: cancelado). O Socket.IO relê o lote no banco. */
export type LotChangedEvent = { lotId: string };

export function publishLotChanged(event: LotChangedEvent): void {
  emitter.emit('lot.changed', event);
}

export function onLotChanged(listener: (event: LotChangedEvent) => void): () => void {
  emitter.on('lot.changed', listener);
  return () => emitter.off('lot.changed', listener);
}

/** Carteira alterada fora de lance e liquidação (ex.: depósito). O Socket.IO relê o saldo no banco. */
export type WalletChangedEvent = { userId: string };

export function publishWalletChanged(event: WalletChangedEvent): void {
  emitter.emit('wallet.changed', event);
}

export function onWalletChanged(listener: (event: WalletChangedEvent) => void): () => void {
  emitter.on('wallet.changed', listener);
  return () => emitter.off('wallet.changed', listener);
}

/** Sessão encerrada no logout. Só o hash do token circula; o token em si nunca sai da requisição. */
export type SessionRevokedEvent = { tokenHash: string };

export function publishSessionRevoked(event: SessionRevokedEvent): void {
  emitter.emit('session.revoked', event);
}

export function onSessionRevoked(listener: (event: SessionRevokedEvent) => void): () => void {
  emitter.on('session.revoked', listener);
  return () => emitter.off('session.revoked', listener);
}
