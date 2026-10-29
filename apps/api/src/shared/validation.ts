import { z } from 'zod';
import { AppError } from './errors.js';

/**
 * Valida o corpo da requisição com zod. Em caso de erro, responde 400 VALIDATION_ERROR
 * com uma mensagem por campo, em português, sem detalhes internos.
 */
export function parseBody<T extends z.ZodType>(schema: T, body: unknown): z.output<T> {
  const result = schema.safeParse(body ?? {});
  if (result.success) return result.data;

  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    if (issue.code === 'unrecognized_keys') {
      fields._ = `Campo não permitido: ${issue.keys.join(', ')}.`;
      continue;
    }
    const field = issue.path.join('.') || '_';
    fields[field] ??= issue.message;
  }

  throw new AppError(400, 'VALIDATION_ERROR', 'Dados inválidos. Confira os campos.', { fields });
}
