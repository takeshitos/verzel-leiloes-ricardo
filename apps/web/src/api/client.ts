// Cliente HTTP único do frontend. Toda chamada passa por aqui para tratar
// erros no formato da API: { error: { code, message } }.

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

type ErrorResponse = { error?: { code?: string; message?: string } };

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(0, 'NETWORK_ERROR', 'Não foi possível falar com o servidor. Verifique sua conexão.');
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const errorInfo = (body as ErrorResponse | null)?.error;
    throw new ApiError(
      response.status,
      errorInfo?.code ?? 'HTTP_ERROR',
      errorInfo?.message ?? `O servidor respondeu com erro ${response.status}.`,
    );
  }

  return body as T;
}
