import pg from 'pg';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const SAFE_DATABASE_NAME = /^[a-z_][a-z0-9_]*$/;

/** Nome do banco na URL (sem credenciais). */
export function databaseNameOf(databaseUrl: string): string {
  return decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\//, ''));
}

/** Descrição para logs: host, porta e banco. Nunca inclui usuário ou senha. */
export function describeDatabase(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  return `${url.hostname}:${url.port || '5432'}/${databaseNameOf(databaseUrl)}`;
}

export function isLocalDatabase(databaseUrl: string): boolean {
  return LOCAL_HOSTS.has(new URL(databaseUrl).hostname);
}

/**
 * Lê a URL do banco do ambiente.
 * Com `test: true`, usa TEST_DATABASE_URL e exige que o nome do banco termine em "_test",
 * para que comandos de teste nunca apontem para o banco de desenvolvimento ou produção.
 * Com `anchor: true`, usa o banco da âncora de auditoria (ANCHOR_DATABASE_URL / TEST_ANCHOR_DATABASE_URL).
 */
export function resolveDatabaseUrl({ test, anchor = false }: { test: boolean; anchor?: boolean }): string {
  const base = anchor ? 'ANCHOR_DATABASE_URL' : 'DATABASE_URL';
  const variable = test ? `TEST_${base}` : base;
  const databaseUrl = process.env[variable];

  if (!databaseUrl) {
    throw new Error(`${variable} não está definida. Veja apps/api/.env.example.`);
  }
  if (!/^postgres(ql)?:\/\//.test(databaseUrl)) {
    throw new Error(`${variable} deve começar com postgres:// ou postgresql://.`);
  }
  if (test && !databaseNameOf(databaseUrl).endsWith('_test')) {
    throw new Error(`${variable} precisa apontar para um banco cujo nome termina em "_test".`);
  }
  return databaseUrl;
}

/**
 * Em desenvolvimento, cria o banco local se ele ainda não existir.
 * Nunca roda em produção nem em servidor remoto, e nunca apaga nada.
 */
export async function ensureLocalDatabaseExists(databaseUrl: string): Promise<void> {
  if (process.env.NODE_ENV === 'production' || !isLocalDatabase(databaseUrl)) {
    return;
  }

  const databaseName = databaseNameOf(databaseUrl);
  if (!SAFE_DATABASE_NAME.test(databaseName)) {
    throw new Error(`Nome de banco inválido para criação automática: "${databaseName}".`);
  }

  // Conecta no banco de manutenção "postgres" do mesmo servidor.
  const maintenanceUrl = new URL(databaseUrl);
  maintenanceUrl.pathname = '/postgres';
  const client = new pg.Client({ connectionString: maintenanceUrl.toString() });

  await client.connect();
  try {
    const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [databaseName]);
    if (existing.rowCount === 0) {
      // O nome já foi validado pela expressão acima; identificadores não aceitam parâmetro $1.
      await client.query(`CREATE DATABASE "${databaseName}"`);
      console.log(`Banco local criado: ${describeDatabase(databaseUrl)}`);
    }
  } finally {
    await client.end();
  }
}
