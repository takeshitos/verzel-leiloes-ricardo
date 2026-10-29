// Regras puras da sala ao vivo (sem React, sem rede): fáceis de testar e de explicar.
//
// - O HTTP é a fonte da verdade. Eventos do Socket.IO só adiantam o que o HTTP também mostraria.
// - `version` do lote só cresce. Evento com versão menor que a já mostrada é descartado.
// - O histórico usa `seq` (1, 2, 3...). Se chegar o lance 5 e o último conhecido é o 3,
//   um evento se perdeu: a tela pede um snapshot HTTP novo (resync).

import type { BidAcceptedEvent, LotExtendedEvent, LotUpdatedEvent, PublicBid, PublicLot } from './types';

export type LiveState = { lot: PublicLot | null; bids: PublicBid[] };

export type SyncResult = { state: LiveState; resync: boolean };

export const emptyLiveState: LiveState = { lot: null, bids: [] };

const lastSeq = (bids: PublicBid[]) => (bids.length > 0 ? bids[0].seq : 0);

/**
 * Snapshot HTTP. Uma resposta HTTP lenta pode chegar depois de um evento mais novo: nesse caso
 * a parte mais nova já mostrada é mantida.
 */
export function applySnapshot(state: LiveState, lot: PublicLot, bids: PublicBid[]): LiveState {
  const keepLot = state.lot !== null && state.lot.id === lot.id && state.lot.version > lot.version;
  const sameLot = state.lot?.id === lot.id;
  const keepBids = sameLot && lastSeq(state.bids) > lastSeq(bids);
  return {
    lot: keepLot ? state.lot : lot,
    bids: keepBids ? state.bids : [...bids].sort((a, b) => b.seq - a.seq),
  };
}

/** Aplica os campos que mudam durante a disputa (o resto do lote, como a obra, não muda). */
export function mergeLotUpdate(lot: PublicLot, event: LotUpdatedEvent): PublicLot {
  return {
    ...lot,
    version: event.version,
    status: event.status,
    settled: event.settled,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    currentBidCents: event.currentBidCents,
    nextMinimumBidCents: event.nextMinimumBidCents,
    bidCount: event.bidCount,
    leaderAlias: event.leaderAlias,
    result: event.result,
  };
}

/** lot.updated: resumo completo do lote, relido do banco pelo servidor. */
export function applyLotUpdated(state: LiveState, event: LotUpdatedEvent): SyncResult {
  const { lot } = state;
  if (!lot || lot.id !== event.lotId) return { state, resync: false };
  if (event.version < lot.version) return { state, resync: false }; // atualização antiga: descarta

  const next: LiveState = { ...state, lot: mergeLotUpdate(lot, event) };
  // Lote diz que há mais lances do que o histórico conhece: algum bid.accepted se perdeu.
  return { state: next, resync: event.bidCount > lastSeq(state.bids) };
}

/** bid.accepted: entra no topo do histórico se for exatamente o próximo `seq`. */
export function applyBidAccepted(state: LiveState, event: BidAcceptedEvent): SyncResult {
  const { lot } = state;
  if (!lot || lot.id !== event.lotId) return { state, resync: false };
  const known = lastSeq(state.bids);
  if (event.seq <= known) return { state, resync: false }; // repetido ou antigo
  if (event.seq > known + 1) return { state, resync: true }; // lacuna: buscar por HTTP

  const bid: PublicBid = { seq: event.seq, alias: event.alias, amountCents: event.amountCents, acceptedAt: event.acceptedAt };
  // Adianta o resumo; o lot.updated que vem logo depois confirma (e traz o próximo mínimo).
  const nextLot =
    event.version > lot.version
      ? { ...lot, currentBidCents: event.amountCents, leaderAlias: event.alias, bidCount: event.seq }
      : lot;
  return { state: { lot: nextLot, bids: [bid, ...state.bids] }, resync: false };
}

/** lot.extended: novo fim (prorrogação). Só vale se não for mais velho que o lote mostrado. */
export function applyLotExtended(state: LiveState, event: LotExtendedEvent): LiveState {
  const { lot } = state;
  if (!lot || lot.id !== event.lotId || event.version < lot.version) return state;
  // O fim só cresce: nunca volta para um horário anterior.
  if (Date.parse(event.endsAt) <= Date.parse(lot.endsAt)) return state;
  return { ...state, lot: { ...lot, endsAt: event.endsAt } };
}

/**
 * Diferença entre o relógio do servidor e o do navegador, usando o meio da requisição
 * (compensa metade do tempo de ida e volta).
 */
export function clockOffsetMs(serverTime: string, sentAtMs: number, receivedAtMs: number): number {
  return Date.parse(serverTime) - (sentAtMs + receivedAtMs) / 2;
}

/** Tempo que falta pelo relógio do SERVIDOR. Só para mostrar: quem decide é o backend. */
export function remainingMs(endsAt: string, offsetMs: number, nowMs: number): number {
  return Math.max(0, Date.parse(endsAt) - (nowMs + offsetMs));
}

/** Saldo mais antigo que o já mostrado (chegou fora de ordem) é descartado. */
export function isNewerWallet(currentAsOf: string | null, incomingAsOf: string): boolean {
  return currentAsOf === null || Date.parse(incomingAsOf) >= Date.parse(currentAsOf);
}
