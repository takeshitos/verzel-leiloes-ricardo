// Cria um lote ao vivo novo para demonstração, sem apagar histórico.
// Exemplo: npm run db:demo-lot -- --key entrega-29-10 --minutes 30
//          npm run db:demo-lot -- --key vitrine-longa --minutes 10080 --item 152006
import { describeError } from '../shared/describe-error.js';
import { parseArgs } from 'node:util';
import type { Pool } from 'pg';
import { loadLocalEnvFile } from '../shared/config.js';
import { describeDatabase, resolveDatabaseUrl } from './database-url.js';
import { createPool } from './pool.js';
import { createDemoLot } from './seed-data.js';

loadLocalEnvFile();

const { values } = parseArgs({
  options: {
    key: { type: 'string' },
    minutes: { type: 'string', default: '60' },
    item: { type: 'string', default: '147016' },
    test: { type: 'boolean', default: false },
  },
});

if (!values.key) {
  console.error('Informe --key, por exemplo: npm run db:demo-lot -- --key entrega-29-10 --minutes 30');
  process.exit(1);
}

let pool: Pool | undefined;
try {
  const databaseUrl = resolveDatabaseUrl({ test: values.test });
  pool = createPool({ databaseUrl, maxConnections: 2 });
  console.log(`Lote de demonstração em ${describeDatabase(databaseUrl)}...`);
  await createDemoLot(pool, {
    key: values.key,
    durationMinutes: Number(values.minutes),
    externalId: values.item,
  });
} catch (error) {
  console.error(`Falha ao criar lote de demonstração: ${describeError(error)}`);
  process.exitCode = 1;
} finally {
  await pool?.end();
}
