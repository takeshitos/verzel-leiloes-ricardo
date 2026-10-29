import { useRef } from 'react';
import { ApiError } from './client';

/**
 * Chave de idempotência por INTENÇÃO do usuário (lance ou depósito).
 * - Mesmo pedido (mesmo valor) depois de uma resposta perdida: a MESMA chave. O servidor
 *   devolve a resposta guardada em vez de executar de novo.
 * - Pedido diferente (outro valor) ou depois de uma resposta definitiva: chave nova.
 * Nunca reenviamos sozinhos: quem decide reenviar é a pessoa, com a mesma chave.
 */
export function useIntentKey() {
  const current = useRef<{ key: string; fingerprint: string } | null>(null);
  return {
    keyFor(fingerprint: string): string {
      if (!current.current || current.current.fingerprint !== fingerprint) {
        current.current = { key: crypto.randomUUID(), fingerprint };
      }
      return current.current.key;
    },
    /** Resposta definitiva (aceito ou recusado): a próxima ação usa chave nova. */
    settle(): void {
      current.current = null;
    },
  };
}

/**
 * A resposta não diz o que aconteceu: falha de rede (status 0) ou erro do servidor (5xx).
 * O pedido pode ter sido gravado ou não; é preciso conferir o estado antes de qualquer reenvio.
 */
export function isUncertain(error: unknown): boolean {
  return !(error instanceof ApiError) || error.status === 0 || error.status >= 500;
}
