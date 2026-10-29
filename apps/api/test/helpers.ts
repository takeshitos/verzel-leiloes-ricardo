import { existsSync } from 'node:fs';
import pg from 'pg';
import type { Pool } from 'pg';
import type { Response } from 'supertest';
import { createApp } from '../src/app.js';
import { resolveDatabaseUrl } from '../src/db/database-url.js';
import { createPool } from '../src/db/pool.js';
import { createAnchorStore, type AnchorStore } from '../src/modules/audit/anchor.js';
import { createKeyring, generateKeyPairBase64, type Keyring } from '../src/modules/audit/keys.js';
import { createAuditService, type AuditService } from '../src/modules/audit/service.js';
import { createCatalogClient, type CatalogClient } from '../src/modules/catalog/client.js';

/** Carrega apps/api/.env (TEST_DATABASE_URL). Variáveis já definidas no ambiente têm prioridade. */
export function loadTestEnv(): void {
  if (existsSync('.env')) process.loadEnvFile('.env');
}

/** Pool para o banco de TESTE. resolveDatabaseUrl recusa banco cujo nome não termina em _test. */
export function createTestPool(maxConnections = 5): Pool {
  loadTestEnv();
  return createPool({ databaseUrl: resolveDatabaseUrl({ test: true }), maxConnections });
}

const ALL_TABLES = [
  'settlement_issues',
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

/** Esvazia todas as tabelas do banco de teste e a âncora de teste. Só roda em bancos _test. */
export async function resetDatabase(pool: Pool): Promise<void> {
  const { rows } = await pool.query<{ name: string }>('SELECT current_database() AS name');
  if (!rows[0].name.endsWith('_test')) {
    throw new Error(`Recusado: resetDatabase só roda em banco _test (atual: ${rows[0].name}).`);
  }
  await pool.query(`TRUNCATE ${ALL_TABLES.join(', ')} RESTART IDENTITY CASCADE`);
  await resetTestAnchor();
}

/**
 * Esvazia a âncora DE TESTE. A tabela é só de inserção (gatilho); aqui o superusuário de
 * desenvolvimento desliga os gatilhos só nesta transação (session_replication_role = replica).
 * Isso nunca roda fora de um banco _test.
 */
export async function resetTestAnchor(): Promise<void> {
  const client = new pg.Client({ connectionString: resolveDatabaseUrl({ test: true, anchor: true }) });
  await client.connect();
  try {
    const { rows } = await client.query<{ name: string }>('SELECT current_database() AS name');
    if (!rows[0].name.endsWith('_test')) throw new Error('Recusado: âncora de teste precisa terminar em _test.');
    await client.query('BEGIN');
    await client.query('SET LOCAL session_replication_role = replica');
    await client.query('DELETE FROM anchor_entries');
    await client.query('COMMIT');
  } finally {
    await client.end();
  }
}

/** Chave Ed25519 gerada para esta execução de testes (não é a de produção nem a do .env). */
const testKeyPair = generateKeyPairBase64();
export const testKeyring: Keyring = createKeyring({ privateKeyBase64: testKeyPair.privateKeyBase64, keyVersion: 1 });

let sharedAnchor: AnchorStore | undefined;
/** Âncora de teste real (TEST_ANCHOR_DATABASE_URL, outro banco). */
export function testAnchor(): AnchorStore {
  loadTestEnv();
  sharedAnchor ??= createAnchorStore({ databaseUrl: resolveDatabaseUrl({ test: true, anchor: true }), timeoutMs: 3_000 });
  return sharedAnchor;
}

/** Âncora "fora do ar": porta local onde nada responde. */
export function unreachableAnchor(): AnchorStore {
  return createAnchorStore({ databaseUrl: 'postgres://ninguem:nada@127.0.0.1:9/verzel_anchor_test', timeoutMs: 500 });
}

export function createTestAudit(pool: Pool, options: { anchor?: AnchorStore; keyring?: Keyring } = {}): AuditService {
  return createAuditService({ pool, anchor: options.anchor ?? testAnchor(), keyring: options.keyring ?? testKeyring });
}

/**
 * Cliente de catálogo apontado para uma porta local onde nada responde.
 * Padrão dos testes: nenhum teste depende da internet sem pedir explicitamente.
 */
export function unreachableCatalog(): CatalogClient {
  return createCatalogClient({ baseUrl: 'http://127.0.0.1:9/api/', timeoutMs: 500 });
}

/** App real (mesmas rotas e middlewares da produção), sem frontend. */
export function createTestApp(
  pool: Pool,
  options: { isProduction?: boolean; catalog?: CatalogClient; audit?: AuditService } = {},
) {
  return createApp({
    webDistDir: 'pasta-inexistente',
    pool,
    isProduction: options.isProduction ?? false,
    trustProxyHops: 0,
    catalog: options.catalog ?? unreachableCatalog(),
    audit: options.audit ?? createTestAudit(pool),
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
