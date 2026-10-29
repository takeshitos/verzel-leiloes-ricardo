import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, apiGet } from '../api/client';
import { clockOffsetMs, mergeLotUpdate } from './lot-sync';
import { getSocket } from './socket';
import type { LotUpdatedEvent, PublicLot } from './types';
import { useConnectionStatus } from './useConnectionStatus';

type ShowcaseResponse = { live: PublicLot[]; scheduled: PublicLot[]; ended: PublicLot[]; serverTime: string };

/** Salas acompanhadas pela vitrine (o servidor aceita até 30 por conexão; a sala do lote usa outra). */
const MAX_WATCHED = 25;
const OFFLINE_POLL_MS = 30_000;

/**
 * Vitrine coerente com o servidor:
 * - busca GET /api/lots ao abrir, ao (re)conectar, ao voltar o foco e quando um lote deveria
 *   mudar de estado pelo relógio (começar ou terminar);
 * - acompanha as salas dos lotes ao vivo e agendados para mostrar lance e prorrogação na hora;
 * - descarta atualização com versão menor que a mostrada.
 */
/** Filtros opcionais da vitrine (extra): trecho do título/autoria e um único estado. */
export type ShowcaseFilter = { text: string; status: '' | 'live' | 'scheduled' | 'ended' };

export function useShowcase(filter: ShowcaseFilter = { text: '', status: '' }) {
  const socket = getSocket();
  const connection = useConnectionStatus();
  const [lots, setLots] = useState<PublicLot[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [offsetMs, setOffsetMs] = useState(0);
  const lotsRef = useRef<PublicLot[] | null>(null);

  const reload = useCallback(() => {
    const sentAt = Date.now();
    const params = new URLSearchParams();
    if (filter.text.trim()) params.set('q', filter.text.trim());
    if (filter.status) params.set('status', filter.status);
    const query = params.toString();
    apiGet<ShowcaseResponse>(query ? `/lots?${query}` : '/lots')
      .then((response) => {
        const all = [...response.live, ...response.scheduled, ...response.ended];
        lotsRef.current = all;
        setLots(all);
        setOffsetMs(clockOffsetMs(response.serverTime, sentAt, Date.now()));
        setError(null);
      })
      .catch((caught: unknown) => {
        setError(caught instanceof ApiError ? caught : new ApiError(0, 'UNKNOWN', 'Erro inesperado ao carregar a vitrine.'));
      });
  }, [filter.text, filter.status]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Eventos das salas: atualizam o card sem refazer a lista.
  useEffect(() => {
    const onUpdated = (event: LotUpdatedEvent) => {
      const current = lotsRef.current;
      if (!current) return;
      const index = current.findIndex((lot) => lot.id === event.lotId);
      if (index === -1 || event.version < current[index].version) return;
      if (event.status === 'cancelled') {
        // Cancelado sai da vitrine.
        lotsRef.current = current.filter((lot) => lot.id !== event.lotId);
      } else {
        const next = [...current];
        next[index] = mergeLotUpdate(current[index], event);
        lotsRef.current = next;
      }
      setLots(lotsRef.current);
    };
    const onClosed = () => reload();
    socket.on('lot.updated', onUpdated);
    socket.on('lot.closed', onClosed);
    socket.on('connect', reload); // o que mudou durante a queda vem pelo HTTP
    return () => {
      socket.off('lot.updated', onUpdated);
      socket.off('lot.closed', onClosed);
      socket.off('connect', reload);
    };
  }, [socket, reload]);

  // Entra nas salas dos lotes que ainda podem mudar.
  const watchedKey = (lots ?? [])
    .filter((lot) => lot.status === 'live' || lot.status === 'scheduled')
    .slice(0, MAX_WATCHED)
    .map((lot) => lot.id)
    .join(',');
  useEffect(() => {
    const ids = watchedKey ? watchedKey.split(',') : [];
    const subscribe = () => ids.forEach((lotId) => socket.emit('lot.subscribe', { lotId }, () => undefined));
    if (socket.connected) subscribe();
    socket.on('connect', subscribe);
    return () => {
      socket.off('connect', subscribe);
      ids.forEach((lotId) => socket.emit('lot.unsubscribe', { lotId }));
    };
  }, [socket, watchedKey]);

  // Voltar para a aba.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') reload();
    };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [reload]);

  // Sem tempo real: busca periódica.
  useEffect(() => {
    if (connection === 'online') return;
    const timer = window.setInterval(reload, OFFLINE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [connection, reload]);

  // Próxima mudança de estado pelo relógio do servidor (agendado começa, ao vivo termina).
  useEffect(() => {
    if (!lots) return;
    const nowServer = Date.now() + offsetMs;
    const boundaries = lots
      .map((lot) => (lot.status === 'scheduled' ? lot.startsAt : lot.status === 'live' ? lot.endsAt : null))
      .filter((iso): iso is string => iso !== null)
      .map((iso) => Date.parse(iso) - nowServer)
      .filter((ms) => ms > -5_000);
    if (boundaries.length === 0) return;
    const waitMs = Math.min(...boundaries) + 1_000;
    if (waitMs > 2_000_000_000) return;
    const timer = window.setTimeout(reload, Math.max(1_000, waitMs));
    return () => window.clearTimeout(timer);
  }, [lots, offsetMs, reload]);

  return {
    lots,
    live: (lots ?? []).filter((lot) => lot.status === 'live'),
    scheduled: (lots ?? []).filter((lot) => lot.status === 'scheduled'),
    ended: (lots ?? []).filter((lot) => lot.status === 'ended'),
    offsetMs,
    connection,
    error,
    reload,
  };
}
