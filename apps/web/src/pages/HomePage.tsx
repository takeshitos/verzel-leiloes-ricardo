import { useEffect, useState } from 'react';
import { ApiError, apiGet } from '../api/client';

type Health = {
  status: string;
  serverTime: string;
  uptimeSeconds: number;
};

type HealthState =
  | { kind: 'loading' }
  | { kind: 'ok'; health: Health }
  | { kind: 'error'; message: string };

const dateTimeFormat = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'medium',
});

export function HomePage() {
  const [state, setState] = useState<HealthState>({ kind: 'loading' });

  useEffect(() => {
    const controller = new AbortController();

    apiGet<Health>('/health', controller.signal)
      .then((health) => setState({ kind: 'ok', health }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const message = error instanceof ApiError ? error.message : 'Erro inesperado ao consultar a API.';
        setState({ kind: 'error', message });
      });

    return () => controller.abort();
  }, []);

  return (
    <section>
      <h1>Casa de Leilões</h1>
      <p>
        Leilões de obras de arte com dinheiro simulado. A vitrine de lotes, a carteira e as salas de
        disputa entram nas próximas etapas.
      </p>

      <div className="card" aria-live="polite">
        <h2>Status da API</h2>
        {state.kind === 'loading' && <p>Consultando o servidor...</p>}
        {state.kind === 'ok' && (
          <p className="status-ok">
            Conectada. Horário do servidor: {dateTimeFormat.format(new Date(state.health.serverTime))}
          </p>
        )}
        {state.kind === 'error' && <p className="status-error">{state.message}</p>}
      </div>
    </section>
  );
}
