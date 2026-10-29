import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

// scrypt do próprio Node: lento de propósito para dificultar ataque de força bruta.
// N=2^15, r=8, p=1 usa cerca de 32 MiB por hash, um meio-termo para o plano gratuito do Render.
const SCRYPT_PARAMS = { N: 32_768, r: 8, p: 1 } as const;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const MAX_MEMORY = 64 * 1024 * 1024;

function scryptAsync(password: string, salt: Buffer, keyLength: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

/** Formato guardado no banco: scrypt$N$r$p$saltBase64$hashBase64 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const hash = await scryptAsync(password, salt, KEY_LENGTH, { ...SCRYPT_PARAMS, maxmem: MAX_MEMORY });
  const { N, r, p } = SCRYPT_PARAMS;
  return ['scrypt', N, r, p, salt.toString('base64'), hash.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, N, r, p, saltBase64, hashBase64] = parts;
  const expected = Buffer.from(hashBase64, 'base64');
  const actual = await scryptAsync(password, Buffer.from(saltBase64, 'base64'), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    maxmem: MAX_MEMORY,
  });

  // Comparação em tempo constante: não revela quantos bytes coincidiram.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
