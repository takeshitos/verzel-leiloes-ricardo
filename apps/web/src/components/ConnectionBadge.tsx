import type { ConnectionStatus } from '../realtime/useConnectionStatus';

const LABELS: Record<ConnectionStatus, string> = {
  online: 'Tempo real conectado',
  connecting: 'Conectando ao tempo real...',
  offline: 'Sem tempo real: tentando reconectar (dados atualizados periodicamente)',
};

/** Mostra se a tela está recebendo atualizações em tempo real (não é o status do lote). */
export function ConnectionBadge({ status }: { status: ConnectionStatus }) {
  return (
    <span className={`connection connection-${status}`} role="status" data-tour="tempo-real">
      <span className="connection-dot" aria-hidden="true" />
      {LABELS[status]}
    </span>
  );
}
