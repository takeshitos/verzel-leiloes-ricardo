import { useEffect } from 'react';
import { Link } from 'react-router';
import { useApi } from '../api/useApi';
import { ArtworkImage } from '../components/ArtworkImage';
import { LotStatusPill } from '../components/LotStatusPill';
import { EmptyState, ErrorState, Loading, PageHeader } from '../components/ui';
import { formatBrl, formatDateTime } from '../format';
import { getSocket } from '../realtime/socket';
import type { PublicLot } from '../realtime/types';

type Outcome = 'leading' | 'outbid' | 'awaiting_settlement' | 'won' | 'lost';
type Participation = {
  lot: PublicLot;
  myBestBidCents: number;
  myBidCount: number;
  lastBidAt: string;
  position: number;
  participantCount: number;
  outcome: Outcome;
  receiptToken: string | null;
};
type Response = { participations: Participation[]; summary: { total: number; won: number; leading: number } };

const OUTCOME: Record<Outcome, { label: string; tone: string }> = {
  leading: { label: 'Você está ganhando', tone: 'ok' },
  outbid: { label: 'Você foi superado', tone: 'warning' },
  awaiting_settlement: { label: 'Aguardando liquidação', tone: 'neutral' },
  won: { label: 'Você arrematou', tone: 'ok' },
  lost: { label: 'Não arrematado', tone: 'neutral' },
};

/** Todos os lotes em que o licitante ofertou (não só as vitórias), com posição e resultado. */
export function ParticipationsPage() {
  const { data, error, loading, reload } = useApi<Response>('/me/participations');

  // Posição e resultado mudam com lances de outras pessoas e com a liquidação.
  useEffect(() => {
    const socket = getSocket();
    const events = ['bid.outbid', 'lot.won', 'wallet.updated', 'connect'] as const;
    events.forEach((name) => socket.on(name, reload));
    return () => events.forEach((name) => socket.off(name, reload));
  }, [reload]);

  return (
    <>
      <PageHeader eyebrow="Licitante" title="Participações e arremates">
        {data && (
          <p>
            {data.summary.total} {data.summary.total === 1 ? 'lote' : 'lotes'} com lance seu · liderando em {data.summary.leading} ·{' '}
            {data.summary.won} {data.summary.won === 1 ? 'arremate' : 'arremates'}
          </p>
        )}
      </PageHeader>

      {loading && !data && <Loading />}
      {error && <ErrorState message={error.message} onRetry={reload} />}

      {data && data.participations.length === 0 && (
        <EmptyState title="Você ainda não deu lances.">
          <Link to="/">Escolha um lote na vitrine</Link>.
        </EmptyState>
      )}

      {data && data.participations.length > 0 && (
        <ul className="participation-list">
          {data.participations.map((item) => {
            const outcome = OUTCOME[item.outcome];
            return (
              <li key={item.lot.id} className="participation">
                <ArtworkImage className="participation-image" src={item.lot.item.image?.url ?? null} alt={item.lot.item.title} />
                <div className="participation-body">
                  <div className="participation-top">
                    <LotStatusPill lot={item.lot} />
                    <span className={`badge badge-${outcome.tone}`}>{outcome.label}</span>
                  </div>
                  <h2 className="participation-title">
                    <Link to={`/lotes/${item.lot.id}`}>{item.lot.item.title}</Link>
                  </h2>
                  <p className="small">
                    Seu melhor lance: <strong>{formatBrl(item.myBestBidCents)}</strong> · posição {item.position} de{' '}
                    {item.participantCount} · último lance seu em {formatDateTime(item.lastBidAt)}
                  </p>
                  {item.receiptToken && (
                    <p className="small">
                      <Link to={`/comprovantes/${item.receiptToken}`}>Ver comprovante</Link>
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
