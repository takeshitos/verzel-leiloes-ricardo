import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, apiGet } from '../api/client';
import { isNewerWallet } from './lot-sync';
import { getSocket } from './socket';
import type { WalletBalance, WalletUpdatedEvent } from './types';

type Me = { user: { role: 'seller' | 'bidder'; publicAlias: string } };

export type PersonalNotice = { id: number; lotId: string; kind: 'outbid' | 'won' };

/**
 * Carteira do licitante logado e avisos pessoais, pela sala privada do Socket.IO.
 * Quem coloca a conexão na sala é o servidor (cookie de sessão); aqui só escutamos.
 * Sem login (ou leiloeiro), devolve wallet = null.
 */
export function useMyWallet() {
  const socket = getSocket();
  const [wallet, setWallet] = useState<WalletBalance | null>(null);
  const [alias, setAlias] = useState<string | null>(null);
  const [notices, setNotices] = useState<PersonalNotice[]>([]);
  const asOf = useRef<string | null>(null);
  const nextId = useRef(1);

  const load = useCallback(() => {
    apiGet<Me>('/auth/me')
      .then((me) => {
        if (me.user.role !== 'bidder') return null; // leiloeiro não tem carteira de lances
        setAlias(me.user.publicAlias);
        return apiGet<{ wallet: WalletBalance }>('/wallet');
      })
      .then((response) => {
        asOf.current = null; // leitura HTTP: o próximo evento sempre vale
        setWallet(response ? response.wallet : null);
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) {
          setWallet(null);
          setAlias(null);
        }
      });
  }, []);

  useEffect(() => {
    load();
    const onWallet = (event: WalletUpdatedEvent) => {
      if (!isNewerWallet(asOf.current, event.asOf)) return; // chegou fora de ordem
      asOf.current = event.asOf;
      setWallet({ totalCents: event.totalCents, committedCents: event.committedCents, availableCents: event.availableCents });
    };
    const notice = (kind: PersonalNotice['kind']) => (event: { lotId: string }) =>
      setNotices((current) => [{ id: nextId.current++, lotId: event.lotId, kind }, ...current].slice(0, 5));
    const onOutbid = notice('outbid');
    const onWon = notice('won');
    const onEnded = () => {
      setWallet(null);
      setAlias(null);
    };
    // Ao (re)conectar, o saldo pode ter mudado enquanto a conexão estava fora.
    const onConnect = () => load();

    socket.on('wallet.updated', onWallet);
    socket.on('bid.outbid', onOutbid);
    socket.on('lot.won', onWon);
    socket.on('session.ended', onEnded);
    socket.on('connect', onConnect);
    return () => {
      socket.off('wallet.updated', onWallet);
      socket.off('bid.outbid', onOutbid);
      socket.off('lot.won', onWon);
      socket.off('session.ended', onEnded);
      socket.off('connect', onConnect);
    };
  }, [socket, load]);

  return { wallet, alias, notices };
}
