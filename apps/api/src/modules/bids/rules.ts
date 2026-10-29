import { AppError } from '../../shared/errors.js';
import { formatBrl } from '../../shared/money.js';

/**
 * Regras do lance como funções puras (sem banco), fáceis de testar nas bordas.
 * O serviço chama estas funções DEPOIS de bloquear lote e carteiras e de ler o relógio.
 */

/** Prorrogação (interpretação do projeto): lance aceito com até 120 s restantes. */
export const ANTI_SNIPING_WINDOW_MS = 120_000;

export type LotForBid = {
  cancelledAt: Date | null;
  startsAt: Date;
  endsAt: Date;
  startingBidCents: number;
  minIncrementCents: number;
  bidCount: number;
  currentBidCents: number | null;
  leaderId: string | null;
};

/** Primeiro lance: pelo menos o inicial. Seguintes: pelo menos o atual + incremento. */
export function minimumNextBid(lot: Pick<LotForBid, 'currentBidCents' | 'startingBidCents' | 'minIncrementCents'>): number {
  return lot.currentBidCents === null ? lot.startingBidCents : lot.currentBidCents + lot.minIncrementCents;
}

function rejection(status: number, code: string, message: string, details: Record<string, unknown> = {}): AppError {
  return new AppError(status, code, message, details);
}

/**
 * Valida o lance. Lança AppError com código estável; a transação é desfeita e nada muda.
 * Janela: início inclusivo (now >= startsAt) e fim exclusivo (now < endsAt).
 */
export function validateBid(params: {
  lot: LotForBid;
  bidderId: string;
  amountCents: number;
  availableCents: number;
  now: Date;
}): void {
  const { lot, bidderId, amountCents, availableCents, now } = params;
  const serverTime = now.toISOString();

  if (lot.cancelledAt) {
    throw rejection(422, 'LOT_CANCELLED', 'Este lote foi cancelado e não aceita lances.', { serverTime });
  }
  if (now < lot.startsAt) {
    throw rejection(422, 'LOT_NOT_STARTED', 'O leilão deste lote ainda não começou.', {
      serverTime,
      startsAt: lot.startsAt.toISOString(),
    });
  }
  if (now >= lot.endsAt) {
    throw rejection(422, 'LOT_ENDED', 'O leilão deste lote já terminou.', { serverTime, endsAt: lot.endsAt.toISOString() });
  }
  if (lot.leaderId === bidderId) {
    throw rejection(422, 'ALREADY_LEADING', 'Você já está ganhando este lote. Não é preciso cobrir o próprio lance.', {
      serverTime,
    });
  }

  const minimum = minimumNextBid(lot);
  if (amountCents < minimum) {
    throw rejection(422, 'BID_BELOW_MINIMUM', `O lance mínimo agora é ${formatBrl(minimum)}.`, {
      serverTime,
      minNextBidCents: minimum,
    });
  }
  if (amountCents > availableCents) {
    throw rejection(
      422,
      'INSUFFICIENT_FUNDS',
      `Saldo disponível insuficiente: você tem ${formatBrl(Math.max(availableCents, 0))} disponível.`,
      { serverTime, availableCents: Math.max(availableCents, 0) },
    );
  }
}

/**
 * Novo fim do lote após um lance aceito em `acceptedAt`.
 * Se faltavam até 120 s, o fim passa a ser acceptedAt + 120 s (nunca diminui).
 * Ex.: fim 15:00:00 e lance às 14:59:30 -> novo fim 15:01:30.
 */
export function extendedEnd(endsAt: Date, acceptedAt: Date): Date {
  const remaining = endsAt.getTime() - acceptedAt.getTime();
  if (remaining > ANTI_SNIPING_WINDOW_MS) return endsAt;
  const candidate = acceptedAt.getTime() + ANTI_SNIPING_WINDOW_MS;
  return new Date(Math.max(candidate, endsAt.getTime()));
}
