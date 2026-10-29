import { useState, type FormEvent } from 'react';
import { ApiError, apiGet } from '../api/client';
import { ArtworkImage } from '../components/ArtworkImage';
import { EmptyState, Field, Loading, Notice } from '../components/ui';
import type { CatalogItem, CatalogSearchResponse } from './types';

type SearchState =
  | { kind: 'idle' }
  | { kind: 'loading'; query: string }
  | { kind: 'done'; query: string; response: CatalogSearchResponse; items: CatalogItem[] }
  | { kind: 'error'; query: string; error: ApiError };

/**
 * Busca no acervo do museu (pela nossa API, que tem timeout e cache). Se o museu cair, só esta
 * parte mostra o aviso: o resto do painel continua funcionando com os dados do nosso banco.
 */
export function CatalogSearch({ onSelect }: { onSelect: (item: CatalogItem) => void }) {
  const [query, setQuery] = useState('');
  const [state, setState] = useState<SearchState>({ kind: 'idle' });
  const [loadingMore, setLoadingMore] = useState(false);

  async function search(text: string, page: number, previous: CatalogItem[] = []) {
    const params = new URLSearchParams({ q: text, page: String(page) });
    const response = await apiGet<CatalogSearchResponse>(`/catalog/search?${params}`);
    return { response, items: [...previous, ...response.items] };
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const text = query.trim();
    setState({ kind: 'loading', query: text });
    try {
      const { response, items } = await search(text, 1);
      setState({ kind: 'done', query: text, response, items });
    } catch (error) {
      setState({ kind: 'error', query: text, error: error instanceof ApiError ? error : new ApiError(0, 'UNKNOWN', 'Erro inesperado.') });
    }
  }

  async function loadMore() {
    if (state.kind !== 'done' || loadingMore) return;
    setLoadingMore(true);
    try {
      const { response, items } = await search(state.query, state.response.page + 1, state.items);
      setState({ kind: 'done', query: state.query, response, items });
    } catch (error) {
      setState({ kind: 'error', query: state.query, error: error instanceof ApiError ? error : new ApiError(0, 'UNKNOWN', 'Erro inesperado.') });
    } finally {
      setLoadingMore(false);
    }
  }

  const fieldError = state.kind === 'error' ? state.error.details.fields?.q : undefined;

  return (
    <div className="catalog-search">
      <form className="search-form" onSubmit={handleSubmit} role="search">
        <Field
          id="catalog-q"
          label="Buscar obra no acervo do Cleveland Museum of Art"
          hint="Em inglês funciona melhor, ex.: landscape, portrait, Monet."
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          error={fieldError}
          minLength={2}
          maxLength={100}
        />
        <button type="submit" className="button button-primary" disabled={state.kind === 'loading' || query.trim().length < 2}>
          {state.kind === 'loading' ? 'Buscando...' : 'Buscar'}
        </button>
      </form>

      {state.kind === 'loading' && <Loading label={`Buscando "${state.query}" no acervo...`} />}

      {state.kind === 'error' && !fieldError && (
        <Notice tone={state.error.code === 'CATALOG_UNAVAILABLE' ? 'warning' : 'error'} title="Busca indisponível agora">
          {state.error.message}{' '}
          {state.error.code === 'CATALOG_UNAVAILABLE' && 'Os seus lotes abaixo continuam funcionando normalmente.'}
        </Notice>
      )}

      {state.kind === 'done' && (
        <>
          <p className="muted small" aria-live="polite">
            {state.response.total} {state.response.total === 1 ? 'obra encontrada' : 'obras encontradas'} para "{state.query}"
            {state.response.source.origin === 'cache' && ' (resultado guardado há pouco)'}
            {state.response.source.stale && ' — o museu não respondeu; mostrando uma busca anterior'}.
          </p>
          {state.items.length === 0 ? (
            <EmptyState title="Nenhuma obra com imagem encontrada.">Tente outra palavra, de preferência em inglês.</EmptyState>
          ) : (
            <ul className="catalog-grid">
              {state.items.map((item) => (
                <li key={item.externalId} className="catalog-item">
                  <ArtworkImage className="catalog-image" src={item.image?.url ?? null} alt={item.title} />
                  <div className="catalog-body">
                    <h4 className="catalog-title">{item.title}</h4>
                    <p className="muted small">{[item.creators, item.creationDate].filter(Boolean).join(' · ') || 'Autoria desconhecida'}</p>
                    {item.technique && <p className="muted small">{item.technique}</p>}
                    <button type="button" className="button button-secondary button-small" onClick={() => onSelect(item)}>
                      Escolher esta obra
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {state.response.hasMore ? (
            <button type="button" className="button button-secondary" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? 'Carregando...' : 'Mais resultados'}
            </button>
          ) : (
            state.items.length > 0 && <p className="muted small">Fim dos resultados.</p>
          )}
        </>
      )}
    </div>
  );
}
