/**
 * Limitador simples por janela fixa, em memória.
 * Suficiente para uma única instância (plano atual). Com várias instâncias,
 * cada uma teria sua contagem; aí seria preciso guardar a contagem no banco.
 */
export type RateLimiter = {
  hit(key: string): { allowed: boolean; retryAfterSeconds: number };
};

export function createRateLimiter({ windowMs, max }: { windowMs: number; max: number }): RateLimiter {
  const buckets = new Map<string, { count: number; resetAt: number }>();

  // Limpeza periódica para o mapa não crescer sem limite. unref: não segura o processo aberto.
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, windowMs);
  cleanup.unref();

  return {
    hit(key) {
      const now = Date.now();
      let bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= now) {
        bucket = { count: 0, resetAt: now + windowMs };
        buckets.set(key, bucket);
      }
      bucket.count++;
      return {
        allowed: bucket.count <= max,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
      };
    },
  };
}
