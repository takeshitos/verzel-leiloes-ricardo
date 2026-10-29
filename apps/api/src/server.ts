import { describeError } from './shared/describe-error.js';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { runMigrations } from './db/migrations.js';
import { createPool } from './db/pool.js';
import { runSeed } from './db/seed-data.js';
import { createAnchorStore, missingAnchor } from './modules/audit/anchor.js';
import { createKeyring, type Keyring } from './modules/audit/keys.js';
import { createAuditService } from './modules/audit/service.js';
import { createCatalogClient } from './modules/catalog/client.js';
import { attachRealtime } from './modules/realtime/socket.js';
import { createSettlementJob } from './modules/settlement/job.js';
import { loadConfig, loadLocalEnvFile, type AppConfig } from './shared/config.js';

loadLocalEnvFile();

let config: AppConfig;
try {
  config = loadConfig();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

// Chave de assinatura da auditoria: inválida = o servidor não sobe (nunca aceita lance sem assinar).
let keyring: Keyring;
try {
  keyring = createKeyring(config.auditKeys);
} catch (error) {
  console.error(`Chave de auditoria inválida: ${describeError(error)}`);
  process.exit(1);
}

// Em produção (Render) as migrações e o seed idempotente rodam antes de aceitar conexões.
// Em desenvolvimento use npm run db:migrate, db:migrate:anchor e db:seed.
if (config.runMigrationsOnStart) {
  try {
    await runMigrations(config.databaseUrl);
    if (config.anchorDatabaseUrl) await runMigrations(config.anchorDatabaseUrl, 'anchor');
  } catch (error) {
    console.error(`Falha nas migrações: ${describeError(error)}`);
    process.exit(1);
  }
}

const pool = createPool({ databaseUrl: config.databaseUrl, maxConnections: config.databasePoolMax });

if (config.runSeedOnStart) {
  try {
    await runSeed(pool);
  } catch (error) {
    console.error(`Falha no seed: ${describeError(error)}`);
    await pool.end();
    process.exit(1);
  }
}

// Funciona tanto em src/server.ts (dev) quanto em dist/server.js (produção):
// os dois ficam dois níveis abaixo de apps/, então o build do web está em apps/web/dist.
const webDistDir = fileURLToPath(new URL('../../web/dist', import.meta.url));

const catalog = createCatalogClient({ baseUrl: config.catalogBaseUrl, timeoutMs: config.catalogTimeoutMs });

// Âncora independente (outro PostgreSQL). Sem ela, a auditoria fica pendente/indisponível.
const anchor = config.anchorDatabaseUrl
  ? createAnchorStore({ databaseUrl: config.anchorDatabaseUrl, timeoutMs: config.anchorTimeoutMs })
  : missingAnchor;
if (!config.anchorDatabaseUrl) {
  console.warn('[auditoria] ANCHOR_DATABASE_URL não configurada: a verificação ficará PENDENTE/INDISPONÍVEL.');
}
const audit = createAuditService({ pool, anchor, keyring });
// Encerramento automático: liquida lotes vencidos com auditoria ÍNTEGRA (relógio do banco).
const settlementJob = createSettlementJob({ pool, audit });

const app = createApp({
  webDistDir,
  pool,
  isProduction: config.isProduction,
  trustProxyHops: config.trustProxyHops,
  clientIpHeader: config.clientIpHeader,
  catalog,
  audit,
});
// Servidor HTTP explícito: API, frontend e Socket.IO na mesma porta e na mesma origem.
const server = createServer(app);
const realtime = attachRealtime(server, { pool, isProduction: config.isProduction });

server.on('error', (error) => {
  console.error(`Falha ao iniciar o servidor: ${error.message}`);
  process.exit(1);
});

let stopReconciler: () => void = () => {};
let stopSettlement: () => void = () => {};
server.listen(config.port, config.host, () => {
  console.log(`API ouvindo em http://${config.host}:${config.port} (${config.nodeEnv})`);
  // Reconcilia checkpoints pendentes agora (recuperação após reinício) e periodicamente.
  stopReconciler = audit.startReconciler(config.auditReconcileIntervalMs);
  // Liquida agora o que venceu com o servidor parado (recuperação) e depois a cada ciclo.
  stopSettlement = settlementJob.start(config.settlementIntervalMs);
});

// Encerramento limpo: para de aceitar conexões, espera as atuais e fecha os pools (banco e âncora).
let shuttingDown = false;

function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Recebido ${signal}. Encerrando o servidor...`);

  const forceExit = setTimeout(() => {
    console.error('Encerramento forçado após 10 segundos.');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  stopReconciler();
  stopSettlement();
  realtime.close(); // fecha os WebSockets; senão server.close esperaria por eles
  server.close((error) => {
    if (error) {
      console.error(`Erro ao encerrar: ${error.message}`);
      process.exit(1);
    }
    Promise.all([pool.end(), anchor.close()])
      .then(() => {
        console.log('Servidor encerrado.');
        process.exit(0);
      })
      .catch((poolError: unknown) => {
        console.error(`Erro ao fechar o pool do banco: ${String(poolError)}`);
        process.exit(1);
      });
  });
  server.closeIdleConnections();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
