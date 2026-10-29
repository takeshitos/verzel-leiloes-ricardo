import { describe, expect, it } from 'vitest';
import {
  applyBidAccepted,
  applyLotExtended,
  applyLotUpdated,
  applySnapshot,
  clockOffsetMs,
  emptyLiveState,
  isNewerWallet,
  myPosition,
  myStanding,
  remainingMs,
  type LiveState,
} from './lot-sync';
import type { BidAcceptedEvent, LotUpdatedEvent, PublicBid, PublicLot } from './types';

const LOT_ID = '11111111-1111-4111-8111-111111111111';

function lot(overrides: Partial<PublicLot> = {}): PublicLot {
  return {
    id: LOT_ID,
    version: 3,
    status: 'live',
    settled: false,
    startsAt: '2026-10-29T10:00:00.000Z',
    endsAt: '2026-10-29T12:00:00.000Z',
    startingBidCents: 10_000,
    minIncrementCents: 1_000,
    currentBidCents: 11_000,
    nextMinimumBidCents: 12_000,
    bidCount: 2,
    leaderAlias: 'LIC-BBBBBB',
    sellerAlias: 'VEN-AAAAAA',
    result: null,
    item: {
      title: 'Obra',
      creators: null,
      creationDate: null,
      technique: null,
      type: null,
      culture: null,
      measurements: null,
      image: null,
    },
    source: { provider: 'Cleveland Museum of Art', externalId: '1', url: null, license: 'CC0', fetchedAt: '2026-10-29T09:00:00.000Z' },
    ...overrides,
  };
}

const bids: PublicBid[] = [
  { seq: 2, alias: 'LIC-BBBBBB', amountCents: 11_000, acceptedAt: '2026-10-29T11:00:00.000Z' },
  { seq: 1, alias: 'LIC-CCCCCC', amountCents: 10_000, acceptedAt: '2026-10-29T10:30:00.000Z' },
];

const start: LiveState = applySnapshot(emptyLiveState, lot(), bids);

function bidEvent(seq: number, version: number, amountCents = 12_000): BidAcceptedEvent {
  return {
    lotId: LOT_ID,
    version,
    seq,
    alias: 'LIC-DDDDDD',
    amountCents,
    acceptedAt: '2026-10-29T11:59:00.000Z',
    auditStatus: 'pending',
    serverTime: '2026-10-29T11:59:00.000Z',
  };
}

function updatedEvent(version: number, overrides: Partial<LotUpdatedEvent> = {}): LotUpdatedEvent {
  return {
    lotId: LOT_ID,
    version,
    status: 'live',
    settled: false,
    startsAt: '2026-10-29T10:00:00.000Z',
    endsAt: '2026-10-29T12:01:00.000Z',
    currentBidCents: 12_000,
    nextMinimumBidCents: 13_000,
    bidCount: 3,
    leaderAlias: 'LIC-DDDDDD',
    result: null,
    serverTime: '2026-10-29T11:59:00.000Z',
    ...overrides,
  };
}

describe('lance aceito (bid.accepted)', () => {
  it('próximo seq entra no topo do histórico', () => {
    const result = applyBidAccepted(start, bidEvent(3, 4));
    expect(result.resync).toBe(false);
    expect(result.state.bids.map((bid) => bid.seq)).toEqual([3, 2, 1]);
    expect(result.state.lot).toMatchObject({ currentBidCents: 12_000, leaderAlias: 'LIC-DDDDDD', bidCount: 3 });
  });

  it('evento antigo ou repetido é descartado sem mudar nada', () => {
    const result = applyBidAccepted(start, bidEvent(2, 3, 11_000));
    expect(result.resync).toBe(false);
    expect(result.state).toBe(start);
  });

  it('lacuna de seq (evento perdido) pede snapshot HTTP', () => {
    const result = applyBidAccepted(start, bidEvent(5, 6));
    expect(result.resync).toBe(true);
    expect(result.state).toBe(start);
  });

  it('evento de outro lote é ignorado', () => {
    const result = applyBidAccepted(start, { ...bidEvent(3, 4), lotId: '22222222-2222-4222-8222-222222222222' });
    expect(result.state).toBe(start);
  });
});

describe('resumo do lote (lot.updated)', () => {
  it('versão menor que a mostrada é descartada (evento antigo chegando depois)', () => {
    const newer = applyLotUpdated(applyBidAccepted(start, bidEvent(3, 4)).state, updatedEvent(4)).state;
    const stale = applyLotUpdated(newer, updatedEvent(3, { endsAt: '2026-10-29T12:00:00.000Z', bidCount: 2 }));
    expect(stale.state).toBe(newer);
    expect(stale.state.lot?.endsAt).toBe('2026-10-29T12:01:00.000Z');
  });

  it('versão nova é aplicada', () => {
    const afterBid = applyBidAccepted(start, bidEvent(3, 4)).state;
    const result = applyLotUpdated(afterBid, updatedEvent(4));
    expect(result.resync).toBe(false);
    expect(result.state.lot).toMatchObject({ version: 4, endsAt: '2026-10-29T12:01:00.000Z', nextMinimumBidCents: 13_000 });
  });

  it('lote com mais lances do que o histórico conhece pede snapshot HTTP', () => {
    const result = applyLotUpdated(start, updatedEvent(5, { bidCount: 4 }));
    expect(result.resync).toBe(true);
    expect(result.state.lot?.version).toBe(5);
  });

  it('encerramento chega com o resultado', () => {
    const result = applyLotUpdated(
      start,
      updatedEvent(4, { status: 'ended', settled: true, bidCount: 2, result: { winnerAlias: 'LIC-BBBBBB', finalAmountCents: 11_000 } }),
    );
    expect(result.state.lot).toMatchObject({ settled: true, result: { finalAmountCents: 11_000 } });
  });
});

describe('prorrogação (lot.extended)', () => {
  it('novo fim substitui o antigo', () => {
    const next = applyLotExtended(start, { lotId: LOT_ID, version: 4, endsAt: '2026-10-29T12:02:00.000Z', serverTime: '' });
    expect(next.lot?.endsAt).toBe('2026-10-29T12:02:00.000Z');
  });

  it('evento velho nunca faz o fim voltar', () => {
    const later = applyLotExtended(start, { lotId: LOT_ID, version: 5, endsAt: '2026-10-29T12:03:00.000Z', serverTime: '' });
    const older = applyLotExtended(later, { lotId: LOT_ID, version: 4, endsAt: '2026-10-29T12:02:00.000Z', serverTime: '' });
    expect(older.lot?.endsAt).toBe('2026-10-29T12:03:00.000Z');
  });
});

describe('snapshot HTTP', () => {
  it('resposta HTTP atrasada não apaga um estado mais novo já recebido por evento', () => {
    const newer = applyLotUpdated(applyBidAccepted(start, bidEvent(3, 4)).state, updatedEvent(4)).state;
    const late = applySnapshot(newer, lot({ version: 3 }), bids);
    expect(late.lot?.version).toBe(4);
    expect(late.bids.map((bid) => bid.seq)).toEqual([3, 2, 1]);
  });

  it('snapshot mais novo substitui tudo (recuperação após reconectar)', () => {
    const recovered = applySnapshot(start, lot({ version: 7, bidCount: 3, endsAt: '2026-10-29T12:05:00.000Z' }), [
      { seq: 3, alias: 'LIC-DDDDDD', amountCents: 12_000, acceptedAt: '2026-10-29T11:59:00.000Z' },
      ...bids,
    ]);
    expect(recovered.lot).toMatchObject({ version: 7, endsAt: '2026-10-29T12:05:00.000Z' });
    expect(recovered.bids).toHaveLength(3);
  });
});

describe('relógio e carteira', () => {
  it('diferença de relógio usa o meio da requisição', () => {
    // Navegador 10 s atrasado; ida e volta de 200 ms.
    const sentAt = Date.parse('2026-10-29T11:59:50.000Z');
    const offset = clockOffsetMs('2026-10-29T12:00:00.100Z', sentAt, sentAt + 200);
    expect(offset).toBe(10_000);
    // "Agora" no servidor = 12:00:00.200; faltam 59,9 s.
    expect(remainingMs('2026-10-29T12:01:00.100Z', offset, sentAt + 200)).toBe(59_900);
  });

  it('tempo restante nunca fica negativo', () => {
    expect(remainingMs('2026-10-29T12:00:00.000Z', 0, Date.parse('2026-10-29T12:00:05.000Z'))).toBe(0);
  });

  it('saldo mais antigo que o mostrado é descartado', () => {
    expect(isNewerWallet(null, '2026-10-29T12:00:00.000Z')).toBe(true);
    expect(isNewerWallet('2026-10-29T12:00:01.000Z', '2026-10-29T12:00:00.000Z')).toBe(false);
    expect(isNewerWallet('2026-10-29T12:00:00.000Z', '2026-10-29T12:00:01.000Z')).toBe(true);
  });
});

describe('posição e situação do usuário', () => {
  const history: PublicBid[] = [
    { seq: 4, alias: 'LIC-A', amountCents: 14_000, acceptedAt: '2026-10-29T11:04:00.000Z' },
    { seq: 3, alias: 'LIC-B', amountCents: 13_000, acceptedAt: '2026-10-29T11:03:00.000Z' },
    { seq: 2, alias: 'LIC-A', amountCents: 12_000, acceptedAt: '2026-10-29T11:02:00.000Z' },
    { seq: 1, alias: 'LIC-C', amountCents: 10_000, acceptedAt: '2026-10-29T11:01:00.000Z' },
  ];

  it('posição pelo melhor lance de cada participante', () => {
    expect(myPosition(history, 'LIC-A')).toEqual({ position: 1, participants: 3 });
    expect(myPosition(history, 'LIC-B')).toEqual({ position: 2, participants: 3 });
    expect(myPosition(history, 'LIC-C')).toEqual({ position: 3, participants: 3 });
  });

  it('quem nunca ofertou não tem posição', () => {
    expect(myPosition(history, 'LIC-Z')).toBeNull();
    expect(myPosition(history, null)).toBeNull();
    expect(myPosition([], 'LIC-A')).toBeNull();
  });

  it('ganhando, superado, aguardando, venceu e perdeu vêm do estado do servidor', () => {
    const live = lot({ leaderAlias: 'LIC-A', bidCount: 4 });
    expect(myStanding(live, history, 'LIC-A')).toBe('leading');
    expect(myStanding(live, history, 'LIC-B')).toBe('outbid');
    expect(myStanding(live, history, 'LIC-Z')).toBe('none');
    expect(myStanding(lot({ status: 'ended', leaderAlias: 'LIC-A' }), history, 'LIC-A')).toBe('awaiting');
    const settled = lot({ status: 'ended', settled: true, result: { winnerAlias: 'LIC-A', finalAmountCents: 14_000 } });
    expect(myStanding(settled, history, 'LIC-A')).toBe('won');
    expect(myStanding(settled, history, 'LIC-B')).toBe('lost');
  });
});
