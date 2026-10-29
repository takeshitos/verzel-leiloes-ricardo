// Formatação para a tela. Dinheiro chega sempre em centavos inteiros; aqui não há conta, só texto.

const reaisFormat = new Intl.NumberFormat('pt-BR');

/** 123456 → "R$ 1.234,56" (separa reais e centavos com inteiros, sem ponto flutuante). */
export function formatBrl(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const absolute = Math.abs(cents);
  const reais = Math.floor(absolute / 100);
  const centavos = String(absolute % 100).padStart(2, '0');
  return `${sign}R$ ${reaisFormat.format(reais)},${centavos}`;
}

const dateTimeFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });

export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
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
