import { useEffect } from 'react';
import { Link } from 'react-router';
import { useApi } from '../api/useApi';
import { ArtworkImage } from '../components/ArtworkImage';
import { LotStatusPill } from '../components/LotStatusPill';
import { EmptyState, ErrorState, Loading, Notice, PageHeader, PendingFeature } from '../components/ui';
import { formatBrl, formatDateTime } from '../format';
import { getSocket } from '../realtime/socket';
import type { PublicLot } from '../realtime/types';

type SellerLot = PublicLot & {
  receiptToken: string | null;
  settlementIssue: { status: string; statusLabel: string; reason: string | null } | null;
};
type Summary = {
  totalReceivedCents: number;
  soldLots: number;
  lotsByStatus: { scheduled: number; live: number; ended: number; cancelled: number };
  endedAwaitingSettlement: number;
  settlementBlocked: number;
};

/** Painel do leiloeiro: só os lotes dele e o total realmente recebido (dados do servidor). */
export function SellerPage() {
  const summary = useApi<{ summary: Summary }>('/seller/summary');
  const lots = useApi<{ lots: SellerLot[] }>('/seller/lots');
  const reloadSummary = summary.reload;
  const reloadLots = lots.reload;

  // Venda liquidada chega pela sala privada do leiloeiro.
  useEffect(() => {
    const socket = getSocket();
    const refresh = () => {
      reloadSummary();
      reloadLots();
    };
    socket.on('lot.sold', refresh);
    socket.on('connect', refresh);
    return () => {
      socket.off('lot.sold', refresh);
      socket.off('connect', refresh);
    };
  }, [reloadSummary, reloadLots]);

  const data = summary.data?.summary;

  return (
    <>
      <PageHeader eyebrow="Leiloeiro" title="Painel" />

      <PendingFeature step="etapa 14">
        Busca de obras no acervo, criação de lote e cancelamento pela tela entram no painel do leiloeiro. As rotas da
        API já existem e decidem tudo no servidor.
      </PendingFeature>

      {summary.error && <ErrorState message={summary.error.message} onRetry={summary.reload} />}
      {data && (
        <div className="stat-grid">
          <div className="stat">
            <p className="stat-label">Total recebido</p>
            <p className="stat-value">{formatBrl(data.totalReceivedCents)}</p>
            <p className="muted small">{data.soldLots} {data.soldLots === 1 ? 'lote vendido' : 'lotes vendidos'}</p>
          </div>
          <div className="stat">
            <p className="stat-label">Ao vivo / agendados</p>
            <p className="stat-value">
              {data.lotsByStatus.live} / {data.lotsByStatus.scheduled}
            </p>
          </div>
          <div className="stat">
            <p className="stat-label">Encerrados</p>
            <p className="stat-value">{data.lotsByStatus.ended}</p>
            {data.endedAwaitingSettlement > 0 && (
              <p className="muted small">{data.endedAwaitingSettlement} aguardando liquidação</p>
            )}
          </div>
        </div>
      )}
      {data && data.settlementBlocked > 0 && (
        <Notice tone="warning" title="Lotes vencidos sem liquidação">
          {data.settlementBlocked} {data.settlementBlocked === 1 ? 'lote não pôde' : 'lotes não puderam'} ser liquidados.
          O motivo aparece no lote abaixo.
        </Notice>
      )}

      <section className="section">
        <h2>Seus lotes</h2>
        {lots.loading && !lots.data && <Loading />}
        {lots.error && <ErrorState message={lots.error.message} onRetry={lots.reload} />}
        {lots.data && lots.data.lots.length === 0 && <EmptyState title="Você ainda não criou lotes." />}
        {lots.data && lots.data.lots.length > 0 && (
          <ul className="participation-list">
            {lots.data.lots.map((lot) => (
              <li key={lot.id} className="participation">
                <ArtworkImage className="participation-image" src={lot.item.image?.url ?? null} alt={lot.item.title} />
                <div className="participation-body">
                  <div className="participation-top">
                    <LotStatusPill lot={lot} />
                  </div>
                  <h3 className="participation-title">
                    <Link to={`/lotes/${lot.id}`}>{lot.item.title}</Link>
                  </h3>
                  <p className="small">
                    {lot.result
                      ? lot.result.winnerAlias
                        ? `Arrematado por ${lot.result.winnerAlias} por ${formatBrl(lot.result.finalAmountCents ?? 0)}`
                        : 'Encerrado sem lances'
                      : lot.currentBidCents !== null
                        ? `Lance atual ${formatBrl(lot.currentBidCents)} (${lot.leaderAlias}) · ${lot.bidCount} lances`
                        : `Lance inicial ${formatBrl(lot.startingBidCents)} · sem lances`}
                  </p>
                  <p className="muted small">
                    {formatDateTime(lot.startsAt)} até {formatDateTime(lot.endsAt)}
                  </p>
                  {lot.settlementIssue && (
                    <p className="small status-warning">
                      {lot.settlementIssue.statusLabel}: {lot.settlementIssue.reason}
                    </p>
                  )}
                  {lot.receiptToken && (
                    <p className="small">
                      <Link to={`/comprovantes/${lot.receiptToken}`}>Ver comprovante</Link>
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
