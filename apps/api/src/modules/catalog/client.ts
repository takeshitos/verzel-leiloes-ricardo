import { AppError } from '../../shared/errors.js';
import { normalizeCmaArtwork, type ItemSnapshotInput } from './cma.js';

/**
 * Cliente da Cleveland Museum of Art Open Access API.
 * - O endereço vem só da configuração do servidor; o navegador nunca escolhe a URL buscada.
 * - Timeout curto, sem nova tentativa automática: uma falha vira 503 CATALOG_UNAVAILABLE.
 * - Cache curto em memória; se a API falhar, pode servir o cache vencido (até 10 min),
 *   informando a idade e a origem.
 */

export const SEARCH_PAGE_SIZE = 12;
const FRESH_SEARCH_MS = 60_000;
const FRESH_ITEM_MS = 5 * 60_000;
const MAX_STALE_MS = 10 * 60_000;
const SEARCH_FIELDS = [
  'id',
  'accession_number',
  'title',
  'creators',
  'creation_date',
  'technique',
  'type',
  'culture',
  'measurements',
  'share_license_status',
  'images',
  'url',
].join(',');
const USER_AGENT = 'verzel-leiloes-ricardo/0.1 (teste tecnico; +https://github.com/takeshitos/verzel-leiloes-ricardo)';

export type CatalogSource = {
  /** 'live': veio agora da API; 'cache': veio do cache em memória. */
  origin: 'live' | 'cache';
  fetchedAt: Date;
  /** true quando a API falhou e o cache já tinha passado do prazo normal. */
  stale: boolean;
};

export type CatalogSearchResult = {
  items: ItemSnapshotInput[];
  page: number;
  pageSize: number;
  total: number;
  /** Obras recebidas mas descartadas (formato inesperado ou não CC0). */
  skipped: number;
  source: CatalogSource;
};

export type CatalogItemResult = { item: ItemSnapshotInput; source: CatalogSource };

export type CatalogClient = {
  search(query: string, page: number): Promise<CatalogSearchResult>;
  /** null quando a obra não existe no museu. */
  getItem(externalId: string): Promise<CatalogItemResult | null>;
};

export type CatalogClientOptions = {
  baseUrl: string;
  timeoutMs: number;
  /** Relógio injetável nos testes. */
  now?: () => number;
};

export function catalogUnavailable(reason: string, details: Record<string, unknown> = {}): AppError {
  return new AppError(
    503,
    'CATALOG_UNAVAILABLE',
    'O catálogo do museu está indisponível agora. Tente novamente em instantes.',
    { reason, ...details },
  );
}

type CacheEntry<T> = { value: T; fetchedAt: number };

export function createCatalogClient({ baseUrl, timeoutMs, now = Date.now }: CatalogClientOptions): CatalogClient {
  const base = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  const searchCache = new Map<string, CacheEntry<Omit<CatalogSearchResult, 'source'>>>();
  const itemCache = new Map<string, CacheEntry<ItemSnapshotInput>>();

  /** Uma chamada HTTP, com timeout. Devolve o JSON, null em 404 ou lança CATALOG_UNAVAILABLE. */
  async function getJson(path: string, params: Record<string, string> = {}): Promise<unknown> {
    const url = new URL(path, base);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      throw catalogUnavailable(timedOut ? `sem resposta em ${timeoutMs} ms` : 'falha de conexão');
    }

    if (response.status === 404) return null;
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('retry-after'));
      throw catalogUnavailable('limite de requisições do museu (429)', Number.isFinite(retryAfter) ? { retryAfterSeconds: retryAfter } : {});
    }
    if (!response.ok) {
      throw catalogUnavailable(`resposta HTTP ${response.status}`);
    }

    try {
      return await response.json();
    } catch {
      throw catalogUnavailable('resposta inválida (não é JSON)');
    }
  }

  function withStaleFallback<T>(
    entry: CacheEntry<T> | undefined,
    error: unknown,
  ): { value: T; source: CatalogSource } {
    if (entry && now() - entry.fetchedAt <= MAX_STALE_MS) {
      return { value: entry.value, source: { origin: 'cache', fetchedAt: new Date(entry.fetchedAt), stale: true } };
    }
    throw error;
  }

  return {
    async search(query, page) {
      const key = `${query.toLowerCase()}|${page}`;
      const cached = searchCache.get(key);
      if (cached && now() - cached.fetchedAt < FRESH_SEARCH_MS) {
        return { ...cached.value, source: { origin: 'cache', fetchedAt: new Date(cached.fetchedAt), stale: false } };
      }

      let body: unknown;
      try {
        body = await getJson('artworks/', {
          q: query,
          cc0: '1',
          has_image: '1',
          limit: String(SEARCH_PAGE_SIZE),
          skip: String((page - 1) * SEARCH_PAGE_SIZE),
          fields: SEARCH_FIELDS,
        });
        if (!isSearchBody(body)) throw catalogUnavailable('resposta inválida (formato inesperado)');
      } catch (error) {
        const fallback = withStaleFallback(cached, error);
        return { ...fallback.value, source: fallback.source };
      }

      const fetchedAtMs = now();
      const items: ItemSnapshotInput[] = [];
      let skipped = 0;
      for (const raw of body.data) {
        try {
          items.push(normalizeCmaArtwork(raw, new Date(fetchedAtMs)));
        } catch {
          skipped++; // uma obra com formato estranho não derruba a busca inteira
        }
      }

      const value = { items, page, pageSize: SEARCH_PAGE_SIZE, total: body.info.total, skipped };
      searchCache.set(key, { value, fetchedAt: fetchedAtMs });
      return { ...value, source: { origin: 'live', fetchedAt: new Date(fetchedAtMs), stale: false } };
    },

    async getItem(externalId) {
      const cached = itemCache.get(externalId);
      if (cached && now() - cached.fetchedAt < FRESH_ITEM_MS) {
        return { item: cached.value, source: { origin: 'cache', fetchedAt: new Date(cached.fetchedAt), stale: false } };
      }

      let body: unknown;
      try {
        body = await getJson(`artworks/${encodeURIComponent(externalId)}`);
      } catch (error) {
        const fallback = withStaleFallback(cached, error);
        return { item: fallback.value, source: fallback.source };
      }
      if (body === null) return null;

      const fetchedAtMs = now();
      const data = typeof body === 'object' && body !== null && 'data' in body ? (body as { data: unknown }).data : undefined;
      let item: ItemSnapshotInput;
      try {
        item = normalizeCmaArtwork(data, new Date(fetchedAtMs));
      } catch {
        throw catalogUnavailable('resposta inválida ou obra sem licença CC0');
      }
      if (item.externalId !== externalId) {
        throw catalogUnavailable('o museu devolveu uma obra diferente da pedida');
      }

      itemCache.set(externalId, { value: item, fetchedAt: fetchedAtMs });
      return { item, source: { origin: 'live', fetchedAt: new Date(fetchedAtMs), stale: false } };
    },
  };
}

function isSearchBody(body: unknown): body is { info: { total: number }; data: unknown[] } {
  if (typeof body !== 'object' || body === null) return false;
  const candidate = body as { info?: { total?: unknown }; data?: unknown };
  return (
    Array.isArray(candidate.data) &&
    typeof candidate.info === 'object' &&
    candidate.info !== null &&
    typeof candidate.info.total === 'number'
  );
}
