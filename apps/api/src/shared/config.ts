import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Variáveis de ambiente aceitas pela API. A validação roda no startup:
// se algo estiver errado, o servidor nem chega a subir.
// "true"/"false" em texto (variáveis de ambiente são sempre strings).
const booleanFlag = z
  .enum(['true', 'false'], { error: 'use true ou false' })
  .default('false')
  .transform((value) => value === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().min(1).optional(),
  DATABASE_URL: z
    .string({ error: 'obrigatória (veja apps/api/.env.example)' })
    .regex(/^postgres(ql)?:\/\//, 'deve começar com postgres:// ou postgresql://'),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  // Em produção (Render), aplica migrações pendentes antes de aceitar conexões.
  RUN_MIGRATIONS_ON_START: booleanFlag,
  // Roda o seed idempotente na inicialização (só cria o que falta; nunca apaga).
  RUN_SEED_ON_START: booleanFlag,
  // API do catálogo (Cleveland Museum of Art). Definida só no servidor; o navegador nunca escolhe.
  CMA_API_BASE_URL: z
    .string()
    .regex(/^https?:\/\//, 'deve começar com http:// ou https://')
    .default('https://openaccess-api.clevelandart.org/api/'),
  CATALOG_TIMEOUT_MS: z.coerce.number().int().min(200).max(30_000).default(5_000),
  // Quantidade de proxies confiáveis na frente da API (Render: 1). Localmente: 0.
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  // Cabeçalho com o IP real do cliente, reescrito pelo proxy (Render/Cloudflare: cf-connecting-ip).
  CLIENT_IP_HEADER: z
    .string()
    .regex(/^[a-z0-9-]+$/i, 'use só o nome do cabeçalho, ex.: cf-connecting-ip')
    .optional(),
  // Auditoria (docs/AUDITORIA.md). Chave privada Ed25519 em base64 (DER PKCS#8), gerada uma vez
  // com npm run audit:keygen. Segredo: só no servidor, nunca no repositório ou no frontend.
  AUDIT_SIGNING_PRIVATE_KEY: z
    .string({ error: 'obrigatória (gere com npm run audit:keygen -w apps/api)' })
    .regex(/^[A-Za-z0-9+/]+=*$/, 'deve estar em base64 numa linha só'),
  AUDIT_KEY_VERSION: z.coerce.number().int().min(1).default(1),
  // Chaves públicas de versões anteriores, para a troca de chave: {"1":"<base64 SPKI>"}.
  AUDIT_PREVIOUS_PUBLIC_KEYS: z
    .string()
    .optional()
    .transform((value, context) => {
      if (!value) return {};
      try {
        return JSON.parse(value) as Record<number, string>;
      } catch {
        context.addIssue({ code: 'custom', message: 'deve ser um JSON como {"1":"<base64>"}' });
        return z.NEVER;
      }
    }),
  // Âncora independente: OUTRO PostgreSQL, com credencial própria. Obrigatória em produção.
  ANCHOR_DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, 'deve começar com postgres:// ou postgresql://')
    .optional(),
  ANCHOR_TIMEOUT_MS: z.coerce.number().int().min(200).max(30_000).default(3_000),
  AUDIT_RECONCILE_INTERVAL_MS: z.coerce.number().int().min(1_000).max(3_600_000).default(30_000),
  // Job de encerramento automático: procura lotes vencidos e liquida (etapa 11).
  SETTLEMENT_INTERVAL_MS: z.coerce.number().int().min(1_000).max(600_000).default(5_000),
}).superRefine((env, context) => {
  if (env.NODE_ENV === 'production' && !env.ANCHOR_DATABASE_URL) {
    context.addIssue({ code: 'custom', path: ['ANCHOR_DATABASE_URL'], message: 'obrigatória em produção (âncora da auditoria)' });
  }
});

export type AppConfig = {
  nodeEnv: 'development' | 'test' | 'production';
  isProduction: boolean;
  port: number;
  host: string;
  databaseUrl: string;
  databasePoolMax: number;
  runMigrationsOnStart: boolean;
  runSeedOnStart: boolean;
  trustProxyHops: number;
  clientIpHeader?: string;
  catalogBaseUrl: string;
  catalogTimeoutMs: number;
  auditKeys: { privateKeyBase64: string; keyVersion: number; previousPublicKeys: Record<number, string> };
  anchorDatabaseUrl?: string;
  anchorTimeoutMs: number;
  auditReconcileIntervalMs: number;
  settlementIntervalMs: number;
};

/**
 * apps/api/.env, achado pela posição deste arquivo (src/shared ou dist/shared), e não pela
 * pasta atual: assim "npm start" na raiz do repositório também encontra o .env da API.
 */
const API_ENV_FILE = fileURLToPath(new URL('../../.env', import.meta.url));

/**
 * Em desenvolvimento, carrega apps/api/.env (se existir) para process.env. Variáveis já
 * definidas no ambiente têm prioridade. Em produção as variáveis vêm do painel da hospedagem,
 * nunca de arquivo.
 */
export function loadLocalEnvFile(filePath = API_ENV_FILE): void {
  if (process.env.NODE_ENV !== 'production' && existsSync(filePath)) {
    process.loadEnvFile(filePath);
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = envSchema.safeParse(env);

  if (!result.success) {
    // Mostra só o nome da variável e o problema, nunca o valor (pode ser segredo).
    const problems = result.error.issues
      .map((issue) => `- ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuração inválida:\n${problems}`);
  }

  const data = result.data;
  const isProduction = data.NODE_ENV === 'production';

  return {
    nodeEnv: data.NODE_ENV,
    isProduction,
    port: data.PORT,
    // Em produção a hospedagem precisa alcançar o processo por qualquer interface.
    host: data.HOST ?? (isProduction ? '0.0.0.0' : '127.0.0.1'),
    databaseUrl: data.DATABASE_URL,
    databasePoolMax: data.DATABASE_POOL_MAX,
    runMigrationsOnStart: data.RUN_MIGRATIONS_ON_START,
    runSeedOnStart: data.RUN_SEED_ON_START,
    trustProxyHops: data.TRUST_PROXY,
    clientIpHeader: data.CLIENT_IP_HEADER?.toLowerCase(),
    catalogBaseUrl: data.CMA_API_BASE_URL,
    catalogTimeoutMs: data.CATALOG_TIMEOUT_MS,
    auditKeys: {
      privateKeyBase64: data.AUDIT_SIGNING_PRIVATE_KEY,
      keyVersion: data.AUDIT_KEY_VERSION,
      previousPublicKeys: data.AUDIT_PREVIOUS_PUBLIC_KEYS,
    },
    anchorDatabaseUrl: data.ANCHOR_DATABASE_URL,
    anchorTimeoutMs: data.ANCHOR_TIMEOUT_MS,
    auditReconcileIntervalMs: data.AUDIT_RECONCILE_INTERVAL_MS,
    settlementIntervalMs: data.SETTLEMENT_INTERVAL_MS,
  };
}
