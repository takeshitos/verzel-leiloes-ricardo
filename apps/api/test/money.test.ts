import { describe, expect, it } from 'vitest';
import { centsSchema, formatBrl } from '../src/shared/money.js';

describe('formatBrl (só operações de texto, sem ponto flutuante)', () => {
  it.each([
    [0, 'R$ 0,00'],
    [5, 'R$ 0,05'],
    [100, 'R$ 1,00'],
    [100_000, 'R$ 1.000,00'],
    [123_456_789, 'R$ 1.234.567,89'],
    [-100, '-R$ 1,00'],
  ])('%i centavos = %s', (cents, text) => {
    expect(formatBrl(cents)).toBe(text);
  });

  it('recusa valor que não é inteiro seguro', () => {
    expect(() => formatBrl(0.1 + 0.2)).toThrow();
    expect(() => formatBrl(Number.MAX_SAFE_INTEGER + 2)).toThrow();
  });
});

describe('centsSchema', () => {
  const schema = centsSchema('O valor', 10_000);

  it('aceita inteiro positivo até o limite', () => {
    expect(schema.parse(1)).toBe(1);
    expect(schema.parse(10_000)).toBe(10_000);
  });

  it.each([[0], [-1], [10.5], [10_001], [Number.NaN], [Number.POSITIVE_INFINITY], ['100']])('recusa %s', (value) => {
    expect(schema.safeParse(value).success).toBe(false);
  });
});
