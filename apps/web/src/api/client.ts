// Cliente HTTP único do frontend. Toda chamada passa por aqui: mesma origem, cookie de sessão
// (HttpOnly, o JavaScript não lê), JSON e erros no formato da API: { error: { code, message, details } }.

export type ErrorDetails = {
  /** Uma mensagem por campo, quando a API recusa a validação (VALIDATION_ERROR). */
  fields?: Record<string, string>;
  [key: string]: unknown;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: ErrorDetails;

  constructor(status: number, code: string, message: string, details: ErrorDetails = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type ErrorResponse = { error?: { code?: string; message?: string; details?: ErrorDetails } };

type RequestOptions = {
  body?: unknown;
  signal?: AbortSignal;
  /** Operações com dinheiro (lance, depósito) exigem uma chave por intenção do usuário. */
  idempotencyKey?: string;
};

async function request<T>(method: 'GET' | 'POST', path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: 'same-origin',
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(0, 'NETWORK_ERROR', 'Não foi possível falar com o servidor. Verifique sua conexão.');
  }

  if (response.status === 204) return undefined as T;
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const errorInfo = (body as ErrorResponse | null)?.error;
    throw new ApiError(
      response.status,
      errorInfo?.code ?? 'HTTP_ERROR',
      errorInfo?.message ?? `O servidor respondeu com erro ${response.status}.`,
      errorInfo?.details ?? {},
    );
  }
  return body as T;
}

export function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  return request<T>('GET', path, { signal });
}

export function apiPost<T>(path: string, body?: unknown, options: Omit<RequestOptions, 'body'> = {}): Promise<T> {
  return request<T>('POST', path, { ...options, body });
}

/** Mensagem para a tela a partir de qualquer erro. */
export function errorMessage(error: unknown, fallback = 'Algo deu errado. Tente de novo.'): string {
  return error instanceof ApiError ? error.message : fallback;
}
