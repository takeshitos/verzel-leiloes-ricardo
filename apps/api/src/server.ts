import { describeError } from './shared/describe-error.js';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { runMigrations } from './db/migrations.js';
import { createPool } from './db/pool.js';
import { runSeed } from './db/seed-data.js';
import { loadConfig, loadLocalEnvFile, type AppConfig } from './shared/config.js';

loadLocalEnvFile();

let config: AppConfig;
try {
  config = loadConfig();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

// Em produção (Render) as migrações e o seed idempotente rodam antes de aceitar conexões.
// Em desenvolvimento use npm run db:migrate e npm run db:seed.
if (config.runMigrationsOnStart) {
  try {
    await runMigrations(config.databaseUrl);
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

const app = createApp({ webDistDir, pool });
// Servidor HTTP explícito: o Socket.IO será ligado nele na etapa 12.
const server = createServer(app);

server.on('error', (error) => {
  console.error(`Falha ao iniciar o servidor: ${error.message}`);
  process.exit(1);
});

server.listen(config.port, config.host, () => {
  console.log(`API ouvindo em http://${config.host}:${config.port} (${config.nodeEnv})`);
});

// Encerramento limpo: para de aceitar conexões, espera as atuais e fecha o pool do banco.
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

  server.close((error) => {
    if (error) {
      console.error(`Erro ao encerrar: ${error.message}`);
      process.exit(1);
    }
    pool
      .end()
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
