import type { RequestHandler } from 'express';
import type { Pool } from 'pg';
import { AppError } from '../../shared/errors.js';
import type { UserRole } from './alias.js';
import { findSessionUser, sessionClearCookieOptions, sessionCookieName } from './session.js';

/**
 * Lê o cookie de sessão e, se for válido, coloca o usuário em req.user.
 * O id e o papel vêm do banco; nada do corpo ou da URL é usado para identificar o usuário.
 */
export function loadSessionUser(pool: Pool, isProduction: boolean): RequestHandler {
  const cookieName = sessionCookieName(isProduction);
  const clearOptions = sessionClearCookieOptions(isProduction);

  return async (req, res, next) => {
    const token: unknown = req.cookies?.[cookieName];
    if (typeof token === 'string' && token !== '') {
      const user = await findSessionUser(pool, token);
      if (user) {
        req.user = user;
      } else {
        // Sessão expirada, revogada ou inventada: limpa o cookie do navegador.
        res.clearCookie(cookieName, clearOptions);
      }
    }
    next();
  };
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.user) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Faça login para continuar.');
  }
  next();
};

const ROLE_MESSAGES: Record<UserRole, string> = {
  seller: 'Apenas leiloeiros podem fazer isso.',
  bidder: 'Apenas licitantes podem fazer isso. Leiloeiros não dão lances.',
};

/** Exige login e um papel específico. 401 sem sessão; 403 com papel errado. */
export function requireRole(role: UserRole): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Faça login para continuar.');
    }
    if (req.user.role !== role) {
      throw new AppError(403, 'FORBIDDEN', ROLE_MESSAGES[role]);
    }
    next();
  };
}
