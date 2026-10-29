import { useEffect, useState } from 'react';
import { getSocket } from './socket';

export type ConnectionStatus = 'connecting' | 'online' | 'offline';

/**
 * Estado da conexão em tempo real, para mostrar na tela. 'connecting' só na primeira conexão;
 * depois de uma queda fica 'offline' (com novas tentativas automáticas) até reconectar.
 */
export function useConnectionStatus(): ConnectionStatus {
  const socket = getSocket();
  const [status, setStatus] = useState<ConnectionStatus>(socket.connected ? 'online' : 'connecting');

  useEffect(() => {
    const online = () => setStatus('online');
    const offline = () => setStatus('offline');
    socket.on('connect', online);
    socket.on('disconnect', offline);
    socket.on('connect_error', offline);
    if (socket.connected) online();
    return () => {
      socket.off('connect', online);
      socket.off('disconnect', offline);
      socket.off('connect_error', offline);
    };
  }, [socket]);

  return status;
}
