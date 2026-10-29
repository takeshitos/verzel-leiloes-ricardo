/**
 * Texto legível para logs de comandos (migração, seed, startup).
 * Conexão recusada em "localhost" chega como AggregateError (uma tentativa para IPv6 e
 * outra para IPv4) com `message` vazio; aqui mostramos os erros internos e o código.
 */
export function describeError(error: unknown): string {
  if (error instanceof AggregateError && error.errors.length > 0) {
    const inner = error.errors.map((item) => describeError(item));
    return [...new Set(inner)].join(' | ');
  }
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    const message = error.message || error.name;
    return typeof code === 'string' && !message.includes(code) ? `${message} (${code})` : message;
  }
  return String(error);
}
