import type { Request, RequestHandler } from 'express';
import { AppError } from './errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Proteção contra CSRF para um app de mesma origem (front e API no mesmo domínio).
 * Em requisições que alteram estado, recusa as que o navegador marca como vindas de
 * outro site (Sec-Fetch-Site) ou cujo Origin não é o próprio host.
 * Junto com o cookie SameSite=Lax e a exigência de JSON, um site malicioso não consegue
 * disparar ações com a sessão do usuário. Clientes sem navegador (curl, testes) não
 * mandam esses cabeçalhos e não são vetor de CSRF.
 */
export const requireSameOrigin: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const fetchSite = req.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
    throw new AppError(403, 'FORBIDDEN_ORIGIN', 'Requisição de outra origem não permitida.');
  }

  const origin = req.get('origin');
  if (origin && hostOf(origin) !== req.get('host')) {
    throw new AppError(403, 'FORBIDDEN_ORIGIN', 'Requisição de outra origem não permitida.');
  }
  next();
};

function hostOf(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

/**
 * Corpo de requisição que altera estado precisa ser JSON. Formulários HTML de outros
 * sites só conseguem enviar form-urlencoded, multipart ou texto.
 */
export const requireJsonBody: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }
  const hasBody = Number(req.get('content-length') ?? 0) > 0 || req.get('transfer-encoding') !== undefined;
  if (hasBody && !req.is('application/json')) {
    throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Envie os dados em JSON (Content-Type: application/json).');
  }
  next();
};

/**
 * IP do cliente para limitar tentativas. No Render, o cabeçalho CF-Connecting-IP é
 * reescrito pelo Cloudflare na frente do serviço; o X-Forwarded-For pode trazer valores
 * inventados pelo cliente. Localmente (sem cabeçalho configurado) usa o IP da conexão.
 */
export function clientIp(req: Request, trustedHeader?: string): string {
  if (trustedHeader) {
    const value = req.get(trustedHeader);
    if (value) return value.split(',')[0].trim();
  }
  return req.ip ?? req.socket.remoteAddress ?? 'desconhecido';
}
