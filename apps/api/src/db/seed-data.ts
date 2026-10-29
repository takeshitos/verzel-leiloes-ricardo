import { readFileSync } from 'node:fs';
import type { Pool } from 'pg';
import { generatePublicAlias, type UserRole } from '../modules/auth/alias.js';
import { hashPassword } from '../modules/auth/password.js';
import { normalizeCmaArtwork, type ItemSnapshotInput } from '../modules/catalog/cma.js';
import { upsertSnapshot } from '../modules/catalog/snapshots.js';
import { withTransaction, type TransactionClient } from './transaction.js';

// Contas fictícias de demonstração (documentadas no README). Domínio example.com é reservado.
export const DEMO_SELLER_EMAIL = 'leiloeiro@example.com';
const DEMO_USERS: { email: string; role: UserRole }[] = [
  { email: DEMO_SELLER_EMAIL, role: 'seller' },
  { email: 'cliente1@example.com', role: 'bidder' },
  { email: 'cliente2@example.com', role: 'bidder' },
];
const DEFAULT_DEMO_PASSWORD = 'leilao-demo-2026';
const INITIAL_DEPOSIT_CENTS = 1_000_000; // R$ 10.000,00 simulados por cliente
const SEED_LOT_KEY = 'seed-lote-inicial';

// Respostas reais da API de Cleveland salvas na etapa 01 (docs/fixtures/catalog/README.md).
const FIXTURES_DIR = new URL('../../../../docs/fixtures/catalog/', import.meta.url);
const FIXTURE_ITEM = { file: 'cma-artwork-152006.json', fetchedAt: '2026-10-29T00:49:01Z' };
const FIXTURE_SEARCH = { file: 'cma-artworks-search.json', fetchedAt: '2026-10-29T00:49:02Z' };

function readJson(fileName: string): unknown {
  return JSON.parse(readFileSync(new URL(fileName, FIXTURES_DIR), 'utf8'));
}

/** Snapshots das duas obras reais disponíveis nas fixtures, por id externo. */
export function loadFixtureSnapshots(): Map<string, ItemSnapshotInput> {
  const snapshots = new Map<string, ItemSnapshotInput>();

  const item = readJson(FIXTURE_ITEM.file) as { data: unknown };
  const itemSnapshot = normalizeCmaArtwork(item.data, new Date(FIXTURE_ITEM.fetchedAt));
  snapshots.set(itemSnapshot.externalId, itemSnapshot);

  const search = readJson(FIXTURE_SEARCH.file) as { data: unknown[] };
  for (const artwork of search.data) {
    const snapshot = normalizeCmaArtwork(artwork, new Date(FIXTURE_SEARCH.fetchedAt));
    if (!snapshots.has(snapshot.externalId)) snapshots.set(snapshot.externalId, snapshot);
  }
  return snapshots;
}

type DemoLotInput = {
  seedKey: string;
  sellerId: string;
  snapshotId: string;
  startingBidCents: number;
  minIncrementCents: number;
  durationMinutes: number;
};

/**
 * Cria um lote ao vivo (começou há 1 minuto) se ainda não existir lote com essa seed_key.
 * As datas usam o relógio do PostgreSQL, o mesmo que valida os lances, em milissegundos
 * (precisão que o JavaScript representa sem perda).
 */
async function createLotIfMissing(client: TransactionClient, lot: DemoLotInput) {
  const inserted = await client.query<{ id: string; ends_at: Date }>(
    `INSERT INTO lots (seller_id, snapshot_id, starting_bid_cents, min_increment_cents,
                       starts_at, original_ends_at, ends_at, seed_key)
     SELECT $1, $2, $3, $4,
            date_trunc('milliseconds', clock_timestamp()) - interval '1 minute',
            date_trunc('milliseconds', clock_timestamp()) + $5::int * interval '1 minute',
            date_trunc('milliseconds', clock_timestamp()) + $5::int * interval '1 minute',
            $6
     ON CONFLICT (seed_key) DO NOTHING
     RETURNING id, ends_at`,
    [lot.sellerId, lot.snapshotId, lot.startingBidCents, lot.minIncrementCents, lot.durationMinutes, lot.seedKey],
  );
  if (inserted.rows[0]) return { created: true, ...inserted.rows[0] };

  const existing = await client.query<{ id: string; ends_at: Date }>(
    'SELECT id, ends_at FROM lots WHERE seed_key = $1',
    [lot.seedKey],
  );
  return { created: false, ...existing.rows[0] };
}

async function insertUserIfMissing(
  client: TransactionClient,
  user: { email: string; role: UserRole; passwordHash: string },
): Promise<{ id: string; created: boolean }> {
  // Repete só se o pseudônimo aleatório colidir com outro (muito improvável).
  for (let attempt = 0; attempt < 5; attempt++) {
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role, public_alias)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [user.email, user.passwordHash, user.role, generatePublicAlias(user.role)],
    );
    if (inserted.rows[0]) return { id: inserted.rows[0].id, created: true };

    const existing = await client.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [user.email]);
    if (existing.rows[0]) return { id: existing.rows[0].id, created: false };
  }
  throw new Error(`Não foi possível gerar um pseudônimo único para ${user.email}.`);
}

/**
 * Seed idempotente: pode rodar quantas vezes quiser. Só cria o que falta e nunca
 * altera senha, pseudônimo ou saldo de quem já existe.
 */
export async function runSeed(pool: Pool): Promise<void> {
  const password = process.env.SEED_DEMO_PASSWORD ?? DEFAULT_DEMO_PASSWORD;
  if (password.length < 8) throw new Error('SEED_DEMO_PASSWORD precisa ter pelo menos 8 caracteres.');

  // Hash fora da transação (é lento de propósito) e só para quem ainda não existe.
  const existingEmails = new Set(
    (
      await pool.query<{ email: string }>('SELECT email FROM users WHERE email = ANY($1)', [
        DEMO_USERS.map((user) => user.email),
      ])
    ).rows.map((row) => row.email),
  );
  const passwordHashes = new Map<string, string>();
  for (const user of DEMO_USERS) {
    if (!existingEmails.has(user.email)) passwordHashes.set(user.email, await hashPassword(password));
  }

  const snapshot = loadFixtureSnapshots().get('152006');
  if (!snapshot) throw new Error('Fixture da obra 152006 não encontrada.');

  const summary = await withTransaction(pool, async (client) => {
    const createdUsers: string[] = [];
    const userIds = new Map<string, string>();

    for (const user of DEMO_USERS) {
      const result = await insertUserIfMissing(client, {
        ...user,
        // Se o usuário já existe, o INSERT não acontece e este valor é ignorado.
        passwordHash: passwordHashes.get(user.email) ?? 'nao-usado',
      });
      userIds.set(user.email, result.id);
      if (result.created) createdUsers.push(user.email);

      await client.query('INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [result.id]);
    }

    let depositsCreated = 0;
    for (const user of DEMO_USERS.filter((candidate) => candidate.role === 'bidder')) {
      const userId = userIds.get(user.email)!;
      // A operation_key única garante um único depósito inicial por cliente.
      const entry = await client.query(
        `INSERT INTO wallet_entries (user_id, kind, amount_cents, operation_key)
         VALUES ($1, 'deposit', $2, $3)
         ON CONFLICT (operation_key) DO NOTHING
         RETURNING id`,
        [userId, INITIAL_DEPOSIT_CENTS, `seed:deposito-inicial:${user.email}`],
      );
      if (entry.rowCount === 1) {
        await client.query(
          'UPDATE wallets SET total_cents = total_cents + $2, updated_at = now() WHERE user_id = $1',
          [userId, INITIAL_DEPOSIT_CENTS],
        );
        depositsCreated++;
      }
    }

    const snapshotId = await upsertSnapshot(client, snapshot);
    const lot = await createLotIfMissing(client, {
      seedKey: SEED_LOT_KEY,
      sellerId: userIds.get(DEMO_SELLER_EMAIL)!,
      snapshotId,
      startingBidCents: 50_000, // R$ 500,00
      minIncrementCents: 5_000, // R$ 50,00
      durationMinutes: 10 * 24 * 60, // 10 dias
    });

    return { createdUsers, depositsCreated, lot };
  });

  console.log(
    summary.createdUsers.length > 0
      ? `Usuários criados: ${summary.createdUsers.join(', ')}`
      : 'Usuários de demonstração já existiam (nada alterado).',
  );
  console.log(`Depósitos iniciais criados agora: ${summary.depositsCreated}`);
  console.log(
    `${summary.lot.created ? 'Lote inicial criado' : 'Lote inicial já existia'}: ${summary.lot.id} ` +
      `(termina em ${summary.lot.ends_at.toISOString()})`,
  );
}

export type DemoLotOptions = {
  key: string;
  durationMinutes: number;
  externalId: string;
};

/** Cria um novo lote ao vivo para demonstração/entrega, sem apagar nada. */
export async function createDemoLot(pool: Pool, options: DemoLotOptions): Promise<void> {
  if (!/^[a-z0-9-]{3,40}$/.test(options.key)) {
    throw new Error('A chave do lote deve ter de 3 a 40 caracteres: letras minúsculas, números ou hífen.');
  }
  if (!Number.isInteger(options.durationMinutes) || options.durationMinutes < 2 || options.durationMinutes > 43_200) {
    throw new Error('A duração deve ser um número inteiro de minutos entre 2 e 43200 (30 dias).');
  }

  const snapshot = loadFixtureSnapshots().get(options.externalId);
  if (!snapshot) {
    throw new Error(`Obra ${options.externalId} não está nas fixtures. Use 147016 ou 152006.`);
  }

  const result = await withTransaction(pool, async (client) => {
    const seller = await client.query<{ id: string }>(
      "SELECT id FROM users WHERE email = $1 AND role = 'seller'",
      [DEMO_SELLER_EMAIL],
    );
    if (!seller.rows[0]) throw new Error('Leiloeiro de demonstração não existe. Rode npm run db:seed antes.');

    const snapshotId = await upsertSnapshot(client, snapshot);
    return createLotIfMissing(client, {
      seedKey: `demo-${options.key}`,
      sellerId: seller.rows[0].id,
      snapshotId,
      startingBidCents: 10_000, // R$ 100,00
      minIncrementCents: 1_000, // R$ 10,00
      durationMinutes: options.durationMinutes,
    });
  });

  console.log(
    `${result.created ? 'Lote de demonstração criado' : 'Já existia lote com essa chave (nada alterado)'}: ` +
      `${result.id} (termina em ${result.ends_at.toISOString()})`,
  );
}
