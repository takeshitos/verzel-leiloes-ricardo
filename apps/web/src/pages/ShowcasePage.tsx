import { ConnectionBadge } from '../components/ConnectionBadge';
import { LotCard } from '../components/LotCard';
import { EmptyState, ErrorState, Loading } from '../components/ui';
import type { PublicLot } from '../realtime/types';
import { useShowcase } from '../realtime/useShowcase';

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
    <section className="showcase-section" aria-labelledby={`${id}-title`}>
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

/** Vitrine pública: ao vivo, agendados e encerrados. Cancelados não aparecem (a API já filtra). */
export function ShowcasePage() {
  const { lots, live, scheduled, ended, offsetMs, connection, error, reload } = useShowcase();

  return (
    <div className="showcase">
      <header className="hero">
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

      {error && lots && <ErrorState message={`Não foi possível atualizar a vitrine: ${error.message}`} onRetry={reload} />}

      {!lots ? (
        error ? (
          <ErrorState message={error.message} onRetry={reload} />
        ) : (
          <Loading label="Carregando a vitrine..." />
        )
      ) : (
        <>
          <ShowcaseSection
            id="ao-vivo"
            title="Ao vivo"
            description="Recebendo lances agora. O relógio segue o horário do servidor."
            lots={live}
            empty="Nenhum lote ao vivo no momento."
            offsetMs={offsetMs}
          />
          <ShowcaseSection
            id="agendados"
            title="Agendados"
            description="Abrem para lances no horário indicado."
            lots={scheduled}
            empty="Nenhum lote agendado."
            offsetMs={offsetMs}
          />
          <ShowcaseSection
            id="encerrados"
            title="Encerrados"
            description="Resultado final de cada lote."
            lots={ended}
            empty="Nenhum lote encerrado ainda."
            offsetMs={offsetMs}
          />
          <p className="muted small list-end">Fim da vitrine: mostramos até 60 lotes por grupo.</p>
        </>
      )}
    </div>
  );
}
