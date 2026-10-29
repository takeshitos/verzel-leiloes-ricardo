import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, apiGet } from '../api/client';
import {
  applyBidAccepted,
  applyLotExtended,
  applyLotUpdated,
  applySnapshot,
  clockOffsetMs,
  emptyLiveState,
  type LiveState,
  type SyncResult,
} from './lot-sync';
import { getSocket } from './socket';
import type {
  BidAcceptedEvent,
  LotExtendedEvent,
  LotUpdatedEvent,
  PublicBid,
  PublicLot,
  SubscribeAck,
} from './types';
import { useConnectionStatus } from './useConnectionStatus';

/** Enquanto o tempo real está fora, a tela busca o estado por HTTP neste intervalo. */
const OFFLINE_POLL_MS = 15_000;
/** Lote vencido aguardando a liquidação do backend (que roda a cada 5 s). */
const AWAITING_SETTLEMENT_POLL_MS = 10_000;

/**
 * Sala ao vivo de um lote. Busca o snapshot HTTP ao abrir, ao (re)conectar, ao voltar o foco
 * para a aba e quando percebe evento perdido. Eventos do Socket.IO só adiantam a tela.
 */
export function useLiveLot(lotId: string) {
  const socket = getSocket();
  const connection = useConnectionStatus();
  const [live, setLive] = useState<LiveState>(emptyLiveState);
  const [offsetMs, setOffsetMs] = useState(0);
  const [error, setError] = useState<ApiError | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);

  // Estado atual também num ref: os ouvintes de eventos calculam o próximo estado a partir dele.
  const liveRef = useRef<LiveState>(emptyLiveState);
  const commit = useCallback((next: LiveState) => {
    liveRef.current = next;
    setLive(next);
  }, []);

  // ---------- snapshot HTTP (fonte da verdade) ----------
  const inFlight = useRef(false);
  const again = useRef(false);

  const resync = useCallback(() => {
    if (inFlight.current) {
      again.current = true; // já tem uma busca em andamento: repete quando ela terminar
      return;
    }
    const run = () => {
      inFlight.current = true;
      again.current = false;
      const sentAt = Date.now();
      Promise.all([
        apiGet<{ lot: PublicLot; serverTime: string }>(`/lots/${lotId}`),
        apiGet<{ bids: PublicBid[] }>(`/lots/${lotId}/bids`),
      ])
        .then(([lotResponse, bidsResponse]) => {
          setOffsetMs(clockOffsetMs(lotResponse.serverTime, sentAt, Date.now()));
          commit(applySnapshot(liveRef.current, lotResponse.lot, bidsResponse.bids));
          setError(null);
          setLastSyncAt(Date.now());
        })
        .catch((caught: unknown) => {
          setError(caught instanceof ApiError ? caught : new ApiError(0, 'UNKNOWN', 'Erro inesperado ao carregar o lote.'));
        })
        .finally(() => {
          inFlight.current = false;
          if (again.current) run();
        });
    };
    run();
  }, [lotId, commit]);

  // Primeira busca. (Trocar de lote remonta o componente: ver `key` em LotPage.)
  useEffect(() => {
    resync();
  }, [resync]);

  // ---------- sala do lote no Socket.IO ----------
  useEffect(() => {
    const handle = (result: SyncResult) => {
      commit(result.state);
      if (result.resync) resync();
    };
    const subscribe = () => {
      socket.emit('lot.subscribe', { lotId }, (ack: SubscribeAck) => {
        // Entrou (ou voltou) na sala: o que aconteceu enquanto estava fora vem pelo HTTP.
        if (ack.ok) resync();
      });
    };
    const onLotUpdated = (event: LotUpdatedEvent) => handle(applyLotUpdated(liveRef.current, event));
    const onBidAccepted = (event: BidAcceptedEvent) => handle(applyBidAccepted(liveRef.current, event));
    const onLotExtended = (event: LotExtendedEvent) => commit(applyLotExtended(liveRef.current, event));
    const onLotClosed = (event: { lotId: string }) => {
      if (event.lotId === lotId) resync();
    };

    socket.on('connect', subscribe);
    socket.on('lot.updated', onLotUpdated);
    socket.on('bid.accepted', onBidAccepted);
    socket.on('lot.extended', onLotExtended);
    socket.on('lot.closed', onLotClosed);
    if (socket.connected) subscribe();

    return () => {
      socket.emit('lot.unsubscribe', { lotId });
      socket.off('connect', subscribe);
      socket.off('lot.updated', onLotUpdated);
      socket.off('bid.accepted', onBidAccepted);
      socket.off('lot.extended', onLotExtended);
      socket.off('lot.closed', onLotClosed);
    };
  }, [socket, lotId, resync, commit]);

  // ---------- voltar para a aba ----------
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') resync();
    };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [resync]);

  // ---------- fallback periódico enquanto o tempo real está fora ----------
  useEffect(() => {
    if (connection === 'online') return;
    const timer = window.setInterval(() => resync(), OFFLINE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [connection, resync]);

  // ---------- mudanças que dependem só do relógio (início, fim, liquidação) ----------
  const lot = live.lot;
  useEffect(() => {
    if (!lot) return;
    if (lot.status === 'ended' && !lot.settled) {
      const timer = window.setInterval(() => resync(), AWAITING_SETTLEMENT_POLL_MS);
      return () => window.clearInterval(timer);
    }
    // Quando chegar a hora (pelo relógio do servidor), pergunta ao servidor o novo status.
    const target = lot.status === 'scheduled' ? lot.startsAt : lot.status === 'live' ? lot.endsAt : null;
    if (!target) return;
    const waitMs = Date.parse(target) - (Date.now() + offsetMs) + 500;
    // setTimeout aceita no máximo ~24,8 dias; lotes mais longos recalculam ao voltar o foco.
    if (waitMs > 2_000_000_000) return;
    const timer = window.setTimeout(() => resync(), Math.max(0, waitMs));
    return () => window.clearTimeout(timer);
  }, [lot, offsetMs, resync]);

  return { lot: live.lot, bids: live.bids, offsetMs, connection, error, lastSyncAt, resync };
}
