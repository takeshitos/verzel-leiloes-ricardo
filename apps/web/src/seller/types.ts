import type { PublicLot } from '../realtime/types';

/** GET /api/catalog/search → items[] e GET /api/catalog/items/:id → item */
export type CatalogItem = {
  externalId: string;
  title: string;
  creators: string | null;
  creationDate: string | null;
  technique: string | null;
  type: string | null;
  culture: string | null;
  measurements: string | null;
  image: { url: string; width: number | null; height: number | null } | null;
  sourceUrl: string | null;
  license: string;
};

export type CatalogSource = {
  provider: string;
  origin: 'live' | 'cache';
  stale: boolean;
  fetchedAt: string;
  ageSeconds: number;
};

export type CatalogSearchResponse = {
  items: CatalogItem[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
  skipped: number;
  source: CatalogSource;
};

/** GET /api/seller/lots → lots[] */
export type SellerLot = PublicLot & {
  receiptToken: string | null;
  settlementIssue: { status: string; statusLabel: string; reason: string | null } | null;
};
