import { z } from 'zod';

/**
 * Dinheiro na API é sempre centavos inteiros (R$ 1.000,00 = 100000).
 * Nada de ponto flutuante em conta financeira: a API recebe e devolve inteiros,
 * e o banco guarda BIGINT. A conversão de texto digitado ("1.000,50") para centavos
 * fica no frontend e é feita por texto, nunca com parseFloat(x) * 100.
 */

/** R$ 100.000.000,00: teto para lance inicial e incremento. */
export const MAX_LOT_VALUE_CENTS = 10_000_000_000;
/** R$ 100.000,00 por depósito simulado. */
export const MAX_DEPOSIT_CENTS = 10_000_000;
/** R$ 10.000.000,00 de saldo total simulado por carteira. */
export const MAX_WALLET_TOTAL_CENTS = 1_000_000_000;

/**
 * Valida centavos: número inteiro (seguro em JavaScript), maior que zero e até `max`.
 * Recusa texto, decimais, negativos, zero e NaN; JSON não transporta Infinity.
 */
export function centsSchema(label: string, max: number) {
  return z
    .number({ error: `Informe ${label} em centavos (número inteiro).` })
    .int(`${label} deve ser em centavos inteiros (sem casas decimais).`)
    .positive(`${label} deve ser maior que zero.`)
    .max(max, `${label} pode ser no máximo ${formatBrl(max)}.`);
}

/** Formata centavos como "R$ 1.234,56" usando só operações de texto (sem ponto flutuante). */
export function formatBrl(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new Error('Centavos inválidos.');
  const negative = cents < 0;
  const digits = String(Math.abs(cents)).padStart(3, '0');
  const reais = digits.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '-' : ''}R$ ${reais},${digits.slice(-2)}`;
}
