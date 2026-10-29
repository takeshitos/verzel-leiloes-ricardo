// Regras do lance como funções puras: bordas exatas de horário e da prorrogação.
import { describe, expect, it } from 'vitest';
import { bidCanonicalContent, bidHash, genesisHash } from '../src/modules/audit/chain.js';
import { ANTI_SNIPING_WINDOW_MS, extendedEnd, minimumNextBid, validateBid, type LotForBid } from '../src/modules/bids/rules.js';
import { AppError } from '../src/shared/errors.js';
import { centsSchema, MAX_LOT_VALUE_CENTS, MAX_WALLET_TOTAL_CENTS } from '../src/shared/money.js';

const T = (iso: string) => new Date(iso);

const baseLot: LotForBid = {
  cancelledAt: null,
  startsAt: T('2026-10-29T15:00:00.000Z'),
  endsAt: T('2026-10-29T16:00:00.000Z'),
  startingBidCents: 10_000,
  minIncrementCents: 1_000,
  bidCount: 0,
  currentBidCents: null,
  leaderId: null,
};

function rejectionCode(fn: () => void): string | null {
  try {
    fn();
    return null;
  } catch (error) {
    return error instanceof AppError ? error.code : 'ERRO_INESPERADO';
  }
}

const valid = { bidderId: 'b', amountCents: 10_000, availableCents: 50_000, now: T('2026-10-29T15:30:00.000Z') };

describe('janela do lote: início inclusivo, fim exclusivo', () => {
  it('aceita exatamente no início', () => {
    expect(rejectionCode(() => validateBid({ ...valid, lot: baseLot, now: baseLot.startsAt }))).toBeNull();
  });
  it('recusa 1 ms antes do início', () => {
    expect(rejectionCode(() => validateBid({ ...valid, lot: baseLot, now: T('2026-10-29T14:59:59.999Z') }))).toBe('LOT_NOT_STARTED');
  });
  it('aceita 1 ms antes do fim', () => {
    expect(rejectionCode(() => validateBid({ ...valid, lot: baseLot, now: T('2026-10-29T15:59:59.999Z') }))).toBeNull();
  });
  it('recusa exatamente no fim', () => {
    expect(rejectionCode(() => validateBid({ ...valid, lot: baseLot, now: baseLot.endsAt }))).toBe('LOT_ENDED');
  });
  it('recusa lote cancelado', () => {
    expect(rejectionCode(() => validateBid({ ...valid, lot: { ...baseLot, cancelledAt: T('2026-10-29T15:10:00Z') } }))).toBe(
      'LOT_CANCELLED',
    );
  });
});

describe('valor e saldo', () => {
  it('primeiro lance pode ser igual ao inicial, não menor', () => {
    expect(rejectionCode(() => validateBid({ ...valid, lot: baseLot, amountCents: 10_000 }))).toBeNull();
    expect(rejectionCode(() => validateBid({ ...valid, lot: baseLot, amountCents: 9_999 }))).toBe('BID_BELOW_MINIMUM');
  });

  it('lances seguintes: atual + incremento, exatamente', () => {
    const lot = { ...baseLot, bidCount: 1, currentBidCents: 10_000, leaderId: 'outro' };
    expect(minimumNextBid(lot)).toBe(11_000);
    expect(rejectionCode(() => validateBid({ ...valid, lot, amountCents: 11_000 }))).toBeNull();
    expect(rejectionCode(() => validateBid({ ...valid, lot, amountCents: 10_999 }))).toBe('BID_BELOW_MINIMUM');
  });

  it('líder não cobre o próprio lance', () => {
    const lot = { ...baseLot, bidCount: 1, currentBidCents: 10_000, leaderId: 'b' };
    expect(rejectionCode(() => validateBid({ ...valid, lot, amountCents: 20_000 }))).toBe('ALREADY_LEADING');
  });

  it('valor precisa caber no disponível (igual ao disponível é aceito)', () => {
    expect(rejectionCode(() => validateBid({ ...valid, lot: baseLot, amountCents: 50_000 }))).toBeNull();
    expect(rejectionCode(() => validateBid({ ...valid, lot: baseLot, amountCents: 50_001 }))).toBe('INSUFFICIENT_FUNDS');
  });
});

describe('prorrogação: até 120 s restantes, novo fim = aceitação + 120 s', () => {
  const end = T('2026-10-29T15:00:00.000Z');
  const at = (msBeforeEnd: number) => new Date(end.getTime() - msBeforeEnd);

  it('exemplo do guia: fim 15:00:00 e lance às 14:59:30 -> 15:01:30', () => {
    expect(extendedEnd(end, T('2026-10-29T14:59:30.000Z')).toISOString()).toBe('2026-10-29T15:01:30.000Z');
  });
  it('faltando exatamente 120 s: novo fim = aceitação + 120 s (igual ao fim atual)', () => {
    expect(extendedEnd(end, at(ANTI_SNIPING_WINDOW_MS)).getTime()).toBe(end.getTime());
  });
  it('faltando 119,999 s: fim avança 1 ms', () => {
    expect(extendedEnd(end, at(119_999)).getTime()).toBe(end.getTime() + 1);
  });
  it('faltando 120,001 s: fim não muda', () => {
    expect(extendedEnd(end, at(120_001))).toBe(end);
  });
  it('faltando 1 ms: novo fim é quase 2 minutos depois', () => {
    expect(extendedEnd(end, at(1)).getTime()).toBe(end.getTime() - 1 + ANTI_SNIPING_WINDOW_MS);
  });
});

describe('cadeia de hashes (formato v1)', () => {
  const lot = {
    lotId: '11111111-1111-4111-8111-111111111111',
    sellerId: '22222222-2222-4222-8222-222222222222',
    snapshotId: '33333333-3333-4333-8333-333333333333',
    startingBidCents: 10_000,
    minIncrementCents: 1_000,
    startsAt: T('2026-10-29T15:00:00.000Z'),
    originalEndsAt: T('2026-10-29T16:00:00.000Z'),
  };
  const bid = {
    lotId: lot.lotId,
    seq: 1,
    bidId: '44444444-4444-4444-8444-444444444444',
    bidderRef: 'c'.repeat(64),
    alias: 'LIC-ABC123',
    amountCents: 10_000,
    acceptedAt: T('2026-10-29T15:30:00.123Z'),
  };

  it('é determinística e muda com qualquer campo', () => {
    const genesis = genesisHash(lot);
    expect(genesis).toMatch(/^[0-9a-f]{64}$/);
    expect(genesisHash(lot)).toBe(genesis);
    expect(genesisHash({ ...lot, startingBidCents: 10_001 })).not.toBe(genesis);

    const hash = bidHash(genesis, bid);
    expect(bidHash(genesis, bid)).toBe(hash);
    expect(bidHash(genesis, { ...bid, amountCents: 10_001 })).not.toBe(hash);
    expect(bidHash(genesis, { ...bid, acceptedAt: T('2026-10-29T15:30:00.124Z') })).not.toBe(hash);
    expect(bidHash('0'.repeat(64), bid)).not.toBe(hash);
  });

  it('conteúdo canônico com centavos como texto e horário UTC em milissegundos', () => {
    expect(bidCanonicalContent(bid)).toBe(
      '{"v":1,"lotId":"11111111-1111-4111-8111-111111111111","seq":1,"bidId":"44444444-4444-4444-8444-444444444444",' +
        `"bidderRef":"${'c'.repeat(64)}","alias":"LIC-ABC123","amountCents":"10000","acceptedAt":"2026-10-29T15:30:00.123Z"}`,
    );
  });
});

describe('limites de centavos (etapa 18)', () => {
  it('lance atual + incremento nos maiores valores aceitos pela API continua inteiro seguro', () => {
    // Maior lance possível = maior saldo (MAX_WALLET_TOTAL_CENTS); maior incremento = MAX_LOT_VALUE_CENTS.
    const next = minimumNextBid({
      currentBidCents: MAX_WALLET_TOTAL_CENTS,
      startingBidCents: MAX_LOT_VALUE_CENTS,
      minIncrementCents: MAX_LOT_VALUE_CENTS,
    });
    expect(next).toBe(11_000_000_000);
    expect(Number.isSafeInteger(next)).toBe(true);
    // E fica muito abaixo do limite do JavaScript e do BIGINT do PostgreSQL.
    expect(next).toBeLessThan(Number.MAX_SAFE_INTEGER / 1000);
  });

  it('lance acima do saldo máximo é recusado pelo esquema da rota (sem chegar à regra)', () => {
    const schema = centsSchema('O valor do lance', MAX_WALLET_TOTAL_CENTS);
    expect(schema.safeParse(MAX_WALLET_TOTAL_CENTS).success).toBe(true);
    expect(schema.safeParse(MAX_WALLET_TOTAL_CENTS + 1).success).toBe(false);
    expect(schema.safeParse(Number.MAX_SAFE_INTEGER + 1).success).toBe(false);
  });
});
