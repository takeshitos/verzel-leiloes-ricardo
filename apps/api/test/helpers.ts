import { existsSync } from 'node:fs';
import type { Pool } from 'pg';
import type { Response } from 'supertest';
import { createApp } from '../src/app.js';
import { resolveDatabaseUrl } from '../src/db/database-url.js';
import { createPool } from '../src/db/pool.js';
import { createCatalogClient, type CatalogClient } from '../src/modules/catalog/client.js';

/** Carrega apps/api/.env (TEST_DATABASE_URL). Variáveis já definidas no ambiente têm prioridade. */
export function loadTestEnv(): void {
  if (existsSync('.env')) process.loadEnvFile('.env');
}

/** Pool para o banco de TESTE. resolveDatabaseUrl recusa banco cujo nome não termina em _test. */
export function createTestPool(): Pool {
  loadTestEnv();
  return createPool({ databaseUrl: resolveDatabaseUrl({ test: true }), maxConnections: 5 });
}

const ALL_TABLES = [
  'audit_checkpoints',
  'receipts',
  'settlements',
  'idempotency_keys',
  'wallet_entries',
  'reservations',
  'bids',
  'lots',
  'item_snapshots',
  'sessions',
  'wallets',
  'users',
];

/** Esvazia todas as tabelas. Só roda se o banco conectado terminar em _test. */
export async function resetDatabase(pool: Pool): Promise<void> {
  const { rows } = await pool.query<{ name: string }>('SELECT current_database() AS name');
  if (!rows[0].name.endsWith('_test')) {
    throw new Error(`Recusado: resetDatabase só roda em banco _test (atual: ${rows[0].name}).`);
  }
  await pool.query(`TRUNCATE ${ALL_TABLES.join(', ')} RESTART IDENTITY CASCADE`);
}

/**
 * Cliente de catálogo apontado para uma porta local onde nada responde.
 * Padrão dos testes: nenhum teste depende da internet sem pedir explicitamente.
 */
export function unreachableCatalog(): CatalogClient {
  return createCatalogClient({ baseUrl: 'http://127.0.0.1:9/api/', timeoutMs: 500 });
}

/** App real (mesmas rotas e middlewares da produção), sem frontend. */
export function createTestApp(pool: Pool, options: { isProduction?: boolean; catalog?: CatalogClient } = {}) {
  return createApp({
    webDistDir: 'pasta-inexistente',
    pool,
    isProduction: options.isProduction ?? false,
    trustProxyHops: 0,
    catalog: options.catalog ?? unreachableCatalog(),
  });
}

/** Lista de Set-Cookie da resposta. */
export function setCookies(response: Response): string[] {
  const raw = response.headers['set-cookie'] as string | string[] | undefined;
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

/** "sid=TOKEN" pronto para o cabeçalho Cookie. */
export function sessionCookie(response: Response): string {
  const cookie = setCookies(response).find((value) => value.startsWith('sid='));
  if (!cookie) throw new Error('Resposta sem cookie de sessão.');
  return cookie.split(';')[0];
}
