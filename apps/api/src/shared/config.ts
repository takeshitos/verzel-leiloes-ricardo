import { existsSync } from 'node:fs';
import { z } from 'zod';

// Variáveis de ambiente aceitas pela API. A validação roda no startup:
// se algo estiver errado, o servidor nem chega a subir.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().min(1).optional(),
});

export type AppConfig = {
  nodeEnv: 'development' | 'test' | 'production';
  isProduction: boolean;
  port: number;
  host: string;
};

/**
 * Em desenvolvimento, carrega apps/api/.env (se existir) para process.env.
 * Em produção as variáveis vêm do painel da hospedagem, nunca de arquivo.
 */
export function loadLocalEnvFile(filePath = '.env'): void {
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

  const { NODE_ENV, PORT, HOST } = result.data;
  const isProduction = NODE_ENV === 'production';

  return {
    nodeEnv: NODE_ENV,
    isProduction,
    port: PORT,
    // Em produção a hospedagem precisa alcançar o processo por qualquer interface.
    host: HOST ?? (isProduction ? '0.0.0.0' : '127.0.0.1'),
  };
}
