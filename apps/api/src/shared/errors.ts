import type { ErrorRequestHandler, RequestHandler } from 'express';

/** Corpo padrão de erro da API: { error: { code, message, details? } }. */
export type ErrorBody = {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
};

/** Erro esperado (regra de negócio, validação, permissão) com HTTP e código estável. */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function errorBody(code: string, message: string, details?: Record<string, unknown>): ErrorBody {
  return details ? { error: { code, message, details } } : { error: { code, message } };
}

/** Qualquer rota /api que não existe responde 404 em JSON, nunca com o HTML da SPA. */
export const apiNotFound: RequestHandler = (_req, res) => {
  res.status(404).json(errorBody('NOT_FOUND', 'Rota da API não encontrada.'));
};

// Erros lançados pelo express.json() trazem "type" e "status".
function isBodyParserError(err: unknown): err is { type: string; status: number } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'type' in err &&
    typeof (err as { type: unknown }).type === 'string' &&
    'status' in err &&
    typeof (err as { status: unknown }).status === 'number'
  );
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof AppError) {
    res.status(err.status).json(errorBody(err.code, err.message, err.details));
    return;
  }

  if (isBodyParserError(err)) {
    if (err.type === 'entity.too.large') {
      res.status(413).json(errorBody('PAYLOAD_TOO_LARGE', 'O corpo da requisição é grande demais.'));
      return;
    }
    res.status(400).json(errorBody('VALIDATION_ERROR', 'O corpo da requisição não é um JSON válido.'));
    return;
  }

  // Erro inesperado: detalhes só no log do servidor, nunca na resposta.
  console.error('[erro interno]', err);
  res.status(500).json(errorBody('INTERNAL_ERROR', 'Erro interno do servidor. Tente novamente.'));
};
