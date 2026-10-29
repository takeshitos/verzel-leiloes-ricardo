import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet } from '../api/client';
import { useAuth } from '../auth/useAuth';
import { isNewerWallet } from './lot-sync';
import { getSocket } from './socket';
import type { WalletBalance, WalletUpdatedEvent } from './types';

/**
 * Carteira do licitante logado, atualizada pela sala privada do Socket.IO.
 * Quem coloca a conexão na sala é o servidor (cookie de sessão); aqui só escutamos.
 * Visitante e leiloeiro: nenhuma chamada à carteira, wallet = null.
 */
export function useMyWallet() {
  const socket = getSocket();
  const { user } = useAuth();
  const isBidder = user?.role === 'bidder';
  const [wallet, setWallet] = useState<WalletBalance | null>(null);
  const asOf = useRef<string | null>(null);

  const load = useCallback(() => {
    apiGet<{ wallet: WalletBalance }>('/wallet')
      .then((response) => {
        asOf.current = null; // leitura HTTP: o próximo evento sempre vale
        setWallet(response.wallet);
      })
      .catch(() => setWallet(null));
  }, []);

  useEffect(() => {
    if (!isBidder) return;
    load();
    const onWallet = (event: WalletUpdatedEvent) => {
      if (!isNewerWallet(asOf.current, event.asOf)) return; // chegou fora de ordem
      asOf.current = event.asOf;
      setWallet({ totalCents: event.totalCents, committedCents: event.committedCents, availableCents: event.availableCents });
    };
    socket.on('wallet.updated', onWallet);
    socket.on('connect', load); // o saldo pode ter mudado enquanto a conexão estava fora
    return () => {
      socket.off('wallet.updated', onWallet);
      socket.off('connect', load);
    };
  }, [socket, load, isBidder]);

  return {
    wallet: isBidder ? wallet : null,
    alias: isBidder ? (user?.publicAlias ?? null) : null,
  };
}
