// Conversões de formulário. Dinheiro: texto digitado → centavos inteiros, só com operações de
// texto e inteiros (nunca parseFloat(x) * 100). Datas: hora local do formulário → UTC (ISO).

export type ParseResult = { ok: true; cents: number } | { ok: false; error: string };

const THOUSANDS = /^\d{1,3}(\.\d{3})+$/; // 1.234 ou 1.234.567
const DIGITS = /^\d+$/;

/**
 * Aceita o jeito brasileiro: "1.234,56", "1234,56", "1234", "R$ 1.234,5".
 * Também aceita ponto decimal sem milhar ("1234.56"). "1.234" é lido como mil duzentos e
 * trinta e quatro reais (milhar), como no Brasil.
 */
export function parseBrlToCents(text: string, label = 'O valor'): ParseResult {
  const clean = text.replace(/R\$/i, '').replace(/\s/g, '');
  if (clean === '') return { ok: false, error: `Informe ${label.toLowerCase()}.` };

  let reais: string;
  let centavos = '';
  if (clean.includes(',')) {
    const parts = clean.split(',');
    if (parts.length !== 2) return { ok: false, error: `${label}: use no máximo uma vírgula.` };
    [reais, centavos] = parts;
    if (!(DIGITS.test(reais) || THOUSANDS.test(reais))) return { ok: false, error: `${label}: valor inválido.` };
  } else if (THOUSANDS.test(clean) || DIGITS.test(clean)) {
    reais = clean;
  } else if (/^\d+\.\d{1,2}$/.test(clean)) {
    [reais, centavos] = clean.split('.');
  } else {
    return { ok: false, error: `${label}: valor inválido. Exemplo: 1.250,00` };
  }

  if (!/^\d{0,2}$/.test(centavos)) return { ok: false, error: `${label}: use no máximo 2 casas de centavos.` };
  const reaisDigits = reais.replace(/\./g, '').replace(/^0+(?=\d)/, '');
  if (reaisDigits.length > 13) return { ok: false, error: `${label}: valor alto demais.` };

  // Inteiros: reais × 100 + centavos. Com até 13 dígitos fica bem abaixo do maior inteiro seguro.
  const cents = Number(reaisDigits || '0') * 100 + Number(centavos.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) return { ok: false, error: `${label}: valor alto demais.` };
  if (cents <= 0) return { ok: false, error: `${label} precisa ser maior que zero.` };
  return { ok: true, cents };
}

/** Date → valor de <input type="datetime-local"> no fuso do navegador ("2026-10-29T15:30"). */
export function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Valor de <input type="datetime-local"> (hora local, sem fuso) → ISO em UTC.
 * Pela especificação, "AAAA-MM-DDTHH:mm" sem fuso é interpretado na hora local do navegador.
 */
export function localInputToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** "UTC−03:00" para o deslocamento do navegador numa data (considera horário de verão). */
export function utcOffsetLabel(date: Date): string {
  const minutes = -date.getTimezoneOffset();
  const sign = minutes >= 0 ? '+' : '−';
  const absolute = Math.abs(minutes);
  return `UTC${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
}
