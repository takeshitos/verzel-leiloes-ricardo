// Contrato HTTP e Socket.IO usado pela sala ao vivo. Cópia do que a API define em
// apps/api/src/modules/lots/queries.ts (PublicLot) e apps/api/src/modules/realtime/socket.ts.

export type LotStatus = 'scheduled' | 'live' | 'ended' | 'cancelled';

export type LotResult = { winnerAlias: string | null; finalAmountCents: number | null } | null;

/** GET /api/lots/:id → { lot, serverTime } */
export type PublicLot = {
  id: string;
  version: number;
  status: LotStatus;
  settled: boolean;
  startsAt: string;
  endsAt: string;
  startingBidCents: number;
  minIncrementCents: number;
  currentBidCents: number | null;
  nextMinimumBidCents: number;
  bidCount: number;
  leaderAlias: string | null;
  sellerAlias: string;
  result: LotResult;
  item: {
    title: string;
    creators: string | null;
    creationDate: string | null;
    technique: string | null;
    type: string | null;
    culture: string | null;
    measurements: string | null;
    image: { url: string; width: number | null; height: number | null } | null;
  };
  source: { provider: string; externalId: string; url: string | null; license: string; fetchedAt: string };
};

/** GET /api/lots/:id/bids → { bids } (mais novo primeiro) */
export type PublicBid = { seq: number; alias: string; amountCents: number; acceptedAt: string };

export type WalletBalance = { totalCents: number; committedCents: number; availableCents: number };

// ---------- eventos (servidor → cliente) ----------

export type LotUpdatedEvent = {
  lotId: string;
  version: number;
  status: LotStatus;
  settled: boolean;
  startsAt: string;
  endsAt: string;
  currentBidCents: number | null;
  nextMinimumBidCents: number;
  bidCount: number;
  leaderAlias: string | null;
  result: LotResult;
  serverTime: string;
};

export type BidAcceptedEvent = {
  lotId: string;
  version: number;
  seq: number;
  alias: string;
  amountCents: number;
  acceptedAt: string;
  auditStatus: 'pending' | 'confirmed';
  serverTime: string;
};

export type LotExtendedEvent = { lotId: string; version: number; endsAt: string; serverTime: string };

export type LotClosedEvent = {
  lotId: string;
  version: number;
  settledAt: string;
  winnerAlias: string | null;
  finalAmountCents: number | null;
  serverTime: string;
};

export type WalletUpdatedEvent = WalletBalance & { asOf: string };

export type SessionState = { authenticated: boolean; role: 'seller' | 'bidder' | null; serverTime: string };

export type SubscribeAck = { ok: true; serverTime: string } | { ok: false; code: string; message: string };
