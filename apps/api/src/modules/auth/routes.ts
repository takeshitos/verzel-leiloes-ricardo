import { Router, type Response } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { AppError } from '../../shared/errors.js';
import { createRateLimiter, type RateLimiter } from '../../shared/rate-limit.js';
import { clientIp } from '../../shared/request-guards.js';
import { parseBody } from '../../shared/validation.js';
import { requireAuth } from './middleware.js';
import { authenticate, registerUser } from './service.js';
import {
  createSession,
  deleteSession,
  sessionClearCookieOptions,
  sessionCookieName,
  sessionCookieOptions,
  type AuthUser,
} from './session.js';

const emailSchema = z
  .string({ error: 'Informe o email.' })
  .trim()
  .toLowerCase()
  .max(254, 'O email pode ter no máximo 254 caracteres.')
  .pipe(z.email({ error: 'Informe um email válido.' }));

// Limite máximo também protege o servidor: scrypt com senha enorme gastaria CPU à toa.
const newPasswordSchema = z
  .string({ error: 'Informe a senha.' })
  .min(8, 'A senha precisa ter pelo menos 8 caracteres.')
  .max(128, 'A senha pode ter no máximo 128 caracteres.');

// strictObject: campos extras (ex.: "isAdmin", "id") são recusados em vez de ignorados.
const registerSchema = z.strictObject({
  email: emailSchema,
  password: newPasswordSchema,
  role: z.enum(['seller', 'bidder'], { error: 'Escolha o papel: seller (leiloeiro) ou bidder (licitante).' }),
});

const loginSchema = z.strictObject({
  email: emailSchema,
  password: z
    .string({ error: 'Informe a senha.' })
    .min(1, 'Informe a senha.')
    .max(128, 'A senha pode ter no máximo 128 caracteres.'),
});

/** Dados do usuário que podem voltar para ele mesmo. Sem id interno, senha, hash ou token. */
function toUserResponse(user: AuthUser) {
  return { email: user.email, role: user.role, publicAlias: user.publicAlias };
}

function enforceLimit(res: Response, limiter: RateLimiter, key: string): void {
  const result = limiter.hit(key);
  if (!result.allowed) {
    res.set('Retry-After', String(result.retryAfterSeconds));
    throw new AppError(429, 'TOO_MANY_REQUESTS', 'Muitas tentativas. Aguarde alguns minutos e tente de novo.', {
      retryAfterSeconds: result.retryAfterSeconds,
    });
  }
}

type AuthRouterOptions = {
  pool: Pool;
  isProduction: boolean;
  clientIpHeader?: string;
};

export function createAuthRouter({ pool, isProduction, clientIpHeader }: AuthRouterOptions) {
  const router = Router();
  const cookieName = sessionCookieName(isProduction);
  const cookieOptions = sessionCookieOptions(isProduction);
  const clearOptions = sessionClearCookieOptions(isProduction);

  // Limites em memória (uma instância). Por IP e, no login, também por email,
  // para frear tentativa de senha distribuída contra uma conta.
  const loginByIp = createRateLimiter({ windowMs: 15 * 60_000, max: 30 });
  const loginByEmail = createRateLimiter({ windowMs: 15 * 60_000, max: 10 });
  const registerByIp = createRateLimiter({ windowMs: 60 * 60_000, max: 10 });

  router.post('/auth/register', async (req, res) => {
    enforceLimit(res, registerByIp, clientIp(req, clientIpHeader));
    const input = parseBody(registerSchema, req.body);

    const { user, token } = await registerUser(pool, input);
    res.cookie(cookieName, token, cookieOptions);
    res.status(201).json({ user: toUserResponse(user) });
  });

  router.post('/auth/login', async (req, res) => {
    enforceLimit(res, loginByIp, clientIp(req, clientIpHeader));
    const input = parseBody(loginSchema, req.body);
    enforceLimit(res, loginByEmail, input.email);

    const user = await authenticate(pool, input.email, input.password);

    // Sempre um token novo no login (evita fixação de sessão); o anterior é revogado.
    const previousToken: unknown = req.cookies?.[cookieName];
    if (typeof previousToken === 'string') await deleteSession(pool, previousToken);

    const token = await createSession(pool, user.id);
    res.cookie(cookieName, token, cookieOptions);
    res.json({ user: toUserResponse(user) });
  });

  // Logout revoga a sessão no banco (não basta apagar o cookie no navegador).
  router.post('/auth/logout', async (req, res) => {
    const token: unknown = req.cookies?.[cookieName];
    if (typeof token === 'string') await deleteSession(pool, token);
    res.clearCookie(cookieName, clearOptions);
    res.status(204).end();
  });

  router.get('/auth/me', requireAuth, (req, res) => {
    res.json({ user: toUserResponse(req.user!) });
  });

  return router;
}
