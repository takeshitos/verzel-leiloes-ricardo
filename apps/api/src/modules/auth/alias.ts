import { randomBytes } from 'node:crypto';

export type UserRole = 'seller' | 'bidder';

/**
 * Pseudônimo público aleatório: VEN-XXXXXX (leiloeiro) ou LIC-XXXXXX (licitante).
 * Não é derivado do email, então não revela quem é a pessoa. É estável por usuário,
 * o que permite ligar as participações públicas do mesmo pseudônimo (limitação documentada).
 */
export function generatePublicAlias(role: UserRole): string {
  const prefix = role === 'seller' ? 'VEN' : 'LIC';
  return `${prefix}-${randomBytes(3).toString('hex').toUpperCase()}`;
}
