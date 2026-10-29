import { useCallback, useEffect, useState } from 'react';
import { ApiError, apiGet } from './client';

type ApiState<T> = { data: T | null; error: ApiError | null; loading: boolean };

/** GET simples com carregando / erro / recarregar. `path` null = não buscar ainda. */
export function useApi<T>(path: string | null) {
  const [state, setState] = useState<ApiState<T>>({ data: null, error: null, loading: path !== null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (path === null) return;
    const controller = new AbortController();
    apiGet<T>(path, controller.signal)
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const apiError = error instanceof ApiError ? error : new ApiError(0, 'UNKNOWN', 'Erro inesperado.');
        setState((current) => ({ data: current.data, error: apiError, loading: false }));
      });
    return () => controller.abort();
  }, [path, attempt]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);
  return { ...state, reload };
}
