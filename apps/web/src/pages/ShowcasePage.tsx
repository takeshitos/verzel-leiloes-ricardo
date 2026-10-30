import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ConnectionBadge } from '../components/ConnectionBadge';
import { LotCard } from '../components/LotCard';
import { EmptyState, ErrorState, Loading } from '../components/ui';
import type { PublicLot } from '../realtime/types';
import { useShowcase, type ShowcaseFilter } from '../realtime/useShowcase';

type SectionProps = {
  id: string;
  title: string;
  description: string;
  lots: PublicLot[];
  empty: string;
  offsetMs: number;
};

function ShowcaseSection({ id, title, description, lots, empty, offsetMs }: SectionProps) {
  return (
    <section className="showcase-section" aria-labelledby={`${id}-title`} data-tour="vitrine-secao">
      <div className="section-heading">
        <h2 id={`${id}-title`}>
          {title} <span className="count">{lots.length}</span>
        </h2>
        <p className="muted">{description}</p>
      </div>
      {lots.length === 0 ? (
        <EmptyState title={empty} />
      ) : (
        <div className="lot-grid">
          {lots.map((lot) => (
            <LotCard key={lot.id} lot={lot} offsetMs={offsetMs} />
          ))}
        </div>
      )}
    </section>
  );
}

const STATUS_OPTIONS: { value: ShowcaseFilter['status']; label: string }[] = [
  { value: '', label: 'Todos os estados' },
  { value: 'live', label: 'Ao vivo' },
  { value: 'scheduled', label: 'Agendados' },
  { value: 'ended', label: 'Encerrados' },
];

function isStatus(value: string | null): value is ShowcaseFilter['status'] {
  return value === '' || value === 'live' || value === 'scheduled' || value === 'ended';
}

/**
 * Vitrine pública: ao vivo, agendados e encerrados. Cancelados não aparecem (a API já filtra).
 * Filtro opcional por título/autoria e estado (extra): fica na URL (?q=&estado=) para recarregar
 * e compartilhar. Não substitui a busca de obras no acervo do museu, que é do leiloeiro.
 */
export function ShowcasePage() {
  const [params, setParams] = useSearchParams();
  const statusParam = params.get('estado');
  const filter: ShowcaseFilter = { text: params.get('q') ?? '', status: isStatus(statusParam) ? statusParam : '' };
  const [typed, setTyped] = useState(filter.text);
  const debounce = useRef<number | undefined>(undefined);
  const { lots, live, scheduled, ended, offsetMs, connection, error, reload } = useShowcase(filter);
  const filtering = filter.text.trim() !== '' || filter.status !== '';

  function updateParams(next: { q?: string; estado?: string }) {
    const merged = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value) merged.set(key, value);
      else merged.delete(key);
    }
    setParams(merged, { replace: true });
  }

  function onType(value: string) {
    setTyped(value);
    window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => updateParams({ q: value.trim() }), 300);
  }

  const sections = [
    { status: 'live', id: 'ao-vivo', title: 'Ao vivo', description: 'Recebendo lances agora. O relógio segue o horário do servidor.', lots: live, empty: 'Nenhum lote ao vivo no momento.' },
    { status: 'scheduled', id: 'agendados', title: 'Agendados', description: 'Abrem para lances no horário indicado.', lots: scheduled, empty: 'Nenhum lote agendado.' },
    { status: 'ended', id: 'encerrados', title: 'Encerrados', description: 'Resultado final de cada lote.', lots: ended, empty: 'Nenhum lote encerrado ainda.' },
  ].filter((section) => filter.status === '' || section.status === filter.status);

  return (
    <div className="showcase">
      <header className="hero" data-tour="vitrine-hero">
        <div>
          <p className="eyebrow">Leilões de arte simulados</p>
          <h1>Obras em disputa</h1>
          <p className="hero-lead">
            Acompanhe os lances em tempo real. Os valores são fictícios e as obras vêm do acervo aberto (CC0) do
            Cleveland Museum of Art, que não tem relação com este projeto.
          </p>
        </div>
        <ConnectionBadge status={connection} />
      </header>

      <form className="showcase-filter" role="search" data-tour="vitrine-filtro" onSubmit={(event) => event.preventDefault()}>
        <div className="field">
          <label htmlFor="filtro-texto">Filtrar por título ou autoria</label>
          <input id="filtro-texto" type="search" value={typed} maxLength={100} placeholder="Ex.: landscape" onChange={(event) => onType(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="filtro-estado">Estado</label>
          <select id="filtro-estado" value={filter.status} onChange={(event) => updateParams({ estado: event.target.value })}>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        {filtering && (
          <button
            type="button"
            className="button button-secondary"
            onClick={() => {
              setTyped('');
              setParams(new URLSearchParams(), { replace: true });
            }}
          >
            Limpar filtros
          </button>
        )}
      </form>

      {error && lots && <ErrorState message={`Não foi possível atualizar a vitrine: ${error.message}`} onRetry={reload} />}

      {!lots ? (
        error ? (
          <ErrorState message={error.message} onRetry={reload} />
        ) : (
          <Loading label="Carregando a vitrine..." />
        )
      ) : (
        <>
          {sections.map((section) => (
            <ShowcaseSection
              key={section.id}
              id={section.id}
              title={section.title}
              description={section.description}
              lots={section.lots}
              empty={filtering ? 'Nenhum lote deste grupo corresponde ao filtro.' : section.empty}
              offsetMs={offsetMs}
            />
          ))}
          <p className="muted small list-end">Fim da vitrine: mostramos até 60 lotes por grupo.</p>
        </>
      )}
    </div>
  );
}
