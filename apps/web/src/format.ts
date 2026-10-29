// Formatação para a tela. Dinheiro chega sempre em centavos inteiros e horários em UTC (ISO);
// aqui não há conta financeira, só texto no padrão brasileiro.

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * 123456 → "R$ 1.234,56". O valor vai ao Intl como texto decimal exato ("1234.56"),
 * montado com inteiros: nenhum centavo passa por ponto flutuante.
 */
export function formatBrl(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const absolute = Math.abs(cents);
  const decimal = `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`;
  return brl.format(decimal as `${number}`);
}

const dateTimeFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const dateTimeSecondsFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });

/** Data e hora no fuso do navegador, ex.: "29/10/2026, 11:44". */
export function formatDateTime(iso: string, withSeconds = false): string {
  return (withSeconds ? dateTimeSecondsFormat : dateTimeFormat).format(new Date(iso));
}

/** Nome do fuso do navegador, para mostrar junto dos horários (ex.: "America/Sao_Paulo"). */
export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Milissegundos → "2d 03:04:05" ou "03:04:05". */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const clock = [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
  return days > 0 ? `${days}d ${clock}` : clock;
}
