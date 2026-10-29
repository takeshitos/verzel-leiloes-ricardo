import { createHash, randomBytes } from 'node:crypto';
import type { CookieOptions } from 'express';
import type { Pool, PoolClient } from 'pg';
import type { UserRole } from './alias.js';

/** Usuário autenticado, como a API o enxerga. Nunca inclui senha, hash ou token. */
export type AuthUser = {
  id: string;
  email: string;
  role: UserRole;
  publicAlias: string;
};

type Queryable = Pool | PoolClient;

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 dias
// Token em base64url de 32 bytes aleatórios = 43 caracteres.
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;

/**
 * Em produção o prefixo __Host- obriga o navegador a aceitar o cookie só com Secure,
 * Path=/ e sem Domain (não pode ser definido por subdomínio).
 */
export function sessionCookieName(isProduction: boolean): string {
  return isProduction ? '__Host-sid' : 'sid';
}

export function sessionCookieOptions(isProduction: boolean): CookieOptions {
  return {
    httpOnly: true, // JavaScript da página não lê o cookie
    sameSite: 'lax', // navegador não envia o cookie em POST vindo de outro site
    secure: isProduction, // só HTTPS em produção
    path: '/',
    maxAge: SESSION_TTL_SECONDS * 1000,
  };
}

/** Mesmas opções, sem validade: usadas para apagar o cookie no navegador. */
export function sessionClearCookieOptions(isProduction: boolean): CookieOptions {
  return { httpOnly: true, sameSite: 'lax', secure: isProduction, path: '/' };
}

/** O banco guarda só o SHA-256 do token. Quem lê o banco não consegue usar a sessão. */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createSession(db: Queryable, userId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await db.query(
    `INSERT INTO sessions (token_hash, user_id, expires_at)
     VALUES ($1, $2, now() + make_interval(secs => $3))`,
    [hashSessionToken(token), userId, SESSION_TTL_SECONDS],
  );
  return token;
}

/** Usuário da sessão, se o token existir e não tiver expirado. Papel vem sempre do banco. */
export async function findSessionUser(db: Queryable, token: string): Promise<AuthUser | null> {
  if (!TOKEN_FORMAT.test(token)) return null;

  const result = await db.query<{ id: string; email: string; role: UserRole; public_alias: string }>(
    `SELECT u.id, u.email, u.role, u.public_alias
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hashSessionToken(token)],
  );
  const row = result.rows[0];
  return row ? { id: row.id, email: row.email, role: row.role, publicAlias: row.public_alias } : null;
}

export async function deleteSession(db: Queryable, token: string): Promise<void> {
  if (!TOKEN_FORMAT.test(token)) return;
  await db.query('DELETE FROM sessions WHERE token_hash = $1', [hashSessionToken(token)]);
}
