// Verificação global: npm run audit:check -w apps/api
// Verifica todos os lotes do banco e lista lotes que a âncora conhece mas sumiram do banco.
import type { Pool } from 'pg';
import { createPool } from '../../db/pool.js';
import { loadConfig, loadLocalEnvFile } from '../../shared/config.js';
import { describeError } from '../../shared/describe-error.js';
import { createAnchorStore, missingAnchor, type AnchorStore } from './anchor.js';
import { createKeyring } from './keys.js';
import { createAuditService } from './service.js';

loadLocalEnvFile();

let pool: Pool | undefined;
let anchor: AnchorStore = missingAnchor;
try {
  const config = loadConfig();
  pool = createPool({ databaseUrl: config.databaseUrl, maxConnections: 2 });
  anchor = config.anchorDatabaseUrl
    ? createAnchorStore({ databaseUrl: config.anchorDatabaseUrl, timeoutMs: config.anchorTimeoutMs })
    : missingAnchor;
  const audit = createAuditService({ pool, anchor, keyring: createKeyring(config.auditKeys) });

  const lots = await pool.query<{ id: string }>('SELECT id FROM lots ORDER BY created_at');
  const counts: Record<string, number> = {};
  for (const lot of lots.rows) {
    const report = await audit.verifyLot(lot.id);
    if (!report) continue;
    counts[report.statusLabel] = (counts[report.statusLabel] ?? 0) + 1;
    if (report.status !== 'intact') console.log(`${report.statusLabel} | lote ${lot.id} | ${report.reason}`);
  }
  console.log('Resumo por estado:', counts);

  const missing = await audit.findLotsMissingFromDatabase();
  if (missing.length > 0) {
    console.log(`ADULTERADO | ${missing.length} lote(s) registrados na âncora não existem mais no banco: ${missing.join(', ')}`);
    process.exitCode = 1;
  } else {
    console.log('Nenhum lote da âncora ausente no banco.');
  }
} catch (error) {
  console.error(`Falha na verificação: ${describeError(error)}`);
  process.exitCode = 1;
} finally {
  await anchor.close();
  await pool?.end();
}
