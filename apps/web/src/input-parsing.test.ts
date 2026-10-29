import { describe, expect, it } from 'vitest';
import { localInputToIso, parseBrlToCents, toLocalInputValue, utcOffsetLabel } from './input-parsing';

const cents = (text: string) => {
  const result = parseBrlToCents(text, 'O valor');
  return result.ok ? result.cents : result.error;
};

describe('parseBrlToCents', () => {
  it('formatos brasileiros', () => {
    expect(cents('1.234,56')).toBe(123_456);
    expect(cents('1234,56')).toBe(123_456);
    expect(cents('R$ 1.234,5')).toBe(123_450);
    expect(cents('1.000')).toBe(100_000); // milhar, não decimal
    expect(cents('1.000.000,00')).toBe(100_000_000);
    expect(cents('100')).toBe(10_000);
    expect(cents('0,30')).toBe(30); // 0,1 + 0,2 em float daria 0,30000000000000004
    expect(cents(' 50 ')).toBe(5_000);
  });

  it('ponto decimal sem milhar', () => {
    expect(cents('1234.56')).toBe(123_456);
    expect(cents('19.9')).toBe(1_990);
  });

  it('valores que poderiam errar com ponto flutuante', () => {
    expect(cents('1,15')).toBe(115); // 1.15 * 100 = 114.99999999999999
    expect(cents('4,35')).toBe(435); // 4.35 * 100 = 434.99999999999994
    expect(cents('100.000.000,00')).toBe(10_000_000_000); // teto do lance inicial
    expect(cents('9.999.999.999.999,99')).toBe(999_999_999_999_999);
  });

  it('recusa entradas inválidas com mensagem', () => {
    expect(cents('')).toBe('Informe o valor.');
    expect(cents('0')).toBe('O valor precisa ser maior que zero.');
    expect(cents('0,00')).toBe('O valor precisa ser maior que zero.');
    expect(cents('1,234')).toMatch(/2 casas/);
    expect(cents('1,2,3')).toMatch(/vírgula/);
    expect(cents('12.34.5')).toMatch(/inválido/);
    expect(cents('-10')).toMatch(/inválido/);
    expect(cents('dez reais')).toMatch(/inválido/);
    expect(cents('1e5')).toMatch(/inválido/);
    expect(cents('99999999999999')).toMatch(/alto demais/);
  });
});

describe('datas do formulário', () => {
  it('hora local do formulário vira o mesmo instante em UTC', () => {
    const local = new Date(2026, 9, 29, 15, 30); // 29/10/2026 15:30 no fuso do navegador
    const value = toLocalInputValue(local);
    expect(value).toBe('2026-10-29T15:30');
    expect(localInputToIso(value)).toBe(local.toISOString());
  });

  it('valor inválido não vira data', () => {
    expect(localInputToIso('')).toBeNull();
    expect(localInputToIso('29/10/2026 15:30')).toBeNull();
  });

  it('rótulo do fuso', () => {
    expect(utcOffsetLabel(new Date(2026, 9, 29))).toMatch(/^UTC[+−]\d{2}:\d{2}$/);
  });
});
