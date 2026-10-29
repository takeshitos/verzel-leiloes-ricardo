import { io, type Socket } from 'socket.io-client';

// Uma conexão Socket.IO para o app inteiro, na mesma origem da página (em desenvolvimento o
// Vite encaminha /socket.io para a API). O cookie de sessão HttpOnly vai junto no handshake:
// é o SERVIDOR que decide se a conexão entra na sala privada do usuário.

let socket: Socket | null = null;

export function getSocket(): Socket {
  socket ??= io({
    // Tenta de novo sozinho, com espera crescente (até 10 s entre tentativas).
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 10_000,
  });
  return socket;
}

/** Depois de login ou logout: reconecta para o servidor reler a sessão do cookie. */
export function reconnectSocket(): void {
  if (!socket) return;
  socket.disconnect();
  socket.connect();
}
