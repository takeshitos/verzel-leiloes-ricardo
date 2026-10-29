import type { ConnectionStatus } from '../realtime/useConnectionStatus';

const LABELS: Record<ConnectionStatus, string> = {
  online: 'Ao vivo',
  connecting: 'Conectando...',
  offline: 'Sem tempo real: tentando reconectar (atualizando a cada 15 s)',
};

/** Mostra se a tela está recebendo atualizações em tempo real. */
export function ConnectionBadge({ status }: { status: ConnectionStatus }) {
  return (
    <span className={`connection connection-${status}`} role="status">
      <span className="connection-dot" aria-hidden="true" />
      {LABELS[status]}
    </span>
  );
}
