import { describe, expect, it } from 'vitest';
import { formatBrl, formatDuration } from './format';

// Intl usa espaço não separável depois de "R$"; normalizamos para comparar.
const plain = (text: string) => text.replace(/\s/g, ' ');

describe('formatBrl', () => {
  it('preserva os centavos sem ponto flutuante', () => {
    expect(plain(formatBrl(123456))).toBe('R$ 1.234,56');
    expect(plain(formatBrl(10))).toBe('R$ 0,10');
    expect(plain(formatBrl(0))).toBe('R$ 0,00');
    // 0,1 + 0,2 em float daria 0,30000000000000004; aqui é exato.
    expect(plain(formatBrl(30))).toBe('R$ 0,30');
    // Valores grandes continuam exatos (limite da carteira simulada: R$ 1.000.000.000,00).
    expect(plain(formatBrl(100_000_000_099))).toBe('R$ 1.000.000.000,99');
  });

  it('negativo', () => {
    expect(plain(formatBrl(-5_050))).toBe('-R$ 50,50');
  });
});

describe('formatDuration', () => {
  it('horas, minutos e segundos; dias quando houver', () => {
    expect(formatDuration(65_000)).toBe('00:01:05');
    expect(formatDuration(2 * 86_400_000 + 3_723_000)).toBe('2d 01:02:03');
  });
});
