import { Link, useParams } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { ArtworkImage } from '../components/ArtworkImage';
import { ConnectionBadge } from '../components/ConnectionBadge';
import { Countdown } from '../components/Countdown';
import { LotStatusPill } from '../components/LotStatusPill';
import { EmptyState, ErrorState, Loading, Notice, PendingFeature } from '../components/ui';
import { browserTimeZone, formatBrl, formatDateTime } from '../format';
import { useLiveLot } from '../realtime/useLiveLot';
import { useMyWallet } from '../realtime/useMyWallet';

/**
 * Sala do lote em tempo real. Mostra o estado do servidor e o atualiza sem recarregar.
 * Formulário de lance, posição do usuário e indicadores definitivos entram na etapa 15.
 */
export function LotPage() {
  const { id = '' } = useParams();
  // key: ao trocar de lote, a sala começa do zero (estado, versão e histórico).
  return <LotRoom key={id} lotId={id} />;
}

function LotRoom({ lotId }: { lotId: string }) {
  const { user } = useAuth();
  const { lot, bids, offsetMs, connection, error, resync } = useLiveLot(lotId);
  const { wallet, alias, notices } = useMyWallet();

  if (!lot) {
    return error ? <ErrorState message={error.message} onRetry={error.status === 404 ? undefined : resync} /> : <Loading label="Carregando o lote..." />;
  }

  const leadingNow = alias !== null && lot.leaderAlias === alias;
  // "Superado" deixa de valer quando a pessoa volta a liderar.
  const myNotices = notices.filter((notice) => notice.lotId === lot.id && !(notice.kind === 'outbid' && leadingNow));
  const details = [
    lot.item.creationDate,
    lot.item.technique,
    lot.item.type,
    lot.item.culture,
    lot.item.measurements,
  ].filter(Boolean);

  return (
    <article className="lot-room">
      <nav className="breadcrumb" aria-label="Você está em">
        <Link to="/">Vitrine</Link> <span aria-hidden="true">/</span> <span>Lote</span>
      </nav>

      <div className="lot-room-grid">
        <figure className="lot-room-figure">
          <ArtworkImage
            className="lot-room-image"
            src={lot.item.image?.url ?? null}
            alt={lot.item.title}
            width={lot.item.image?.width}
            height={lot.item.image?.height}
          />
          <figcaption className="muted small">
            Fonte: {lot.source.provider}
            {lot.source.url && (
              <>
                {' · '}
                <a href={lot.source.url} target="_blank" rel="noreferrer">
                  ver no museu
                </a>
              </>
            )}{' '}
            · licença {lot.source.license}
          </figcaption>
        </figure>

        <div className="lot-room-side">
          <div className="lot-room-title">
            <div className="lot-room-badges">
              <LotStatusPill lot={lot} />
              <ConnectionBadge status={connection} />
            </div>
            <h1>{lot.item.title}</h1>
            {lot.item.creators && <p className="lot-creator">{lot.item.creators}</p>}
            {details.length > 0 && <p className="muted small">{details.join(' · ')}</p>}
          </div>

          {error && <Notice tone="warning">Última atualização falhou: {error.message}</Notice>}

          <div className="card lot-panel" aria-live="polite">
            {lot.status === 'live' && (
              <div className="lot-panel-clock">
                <p className="stat-label">Termina em</p>
                <Countdown endsAt={lot.endsAt} offsetMs={offsetMs} />
                <p className="muted small">
                  Fim: {formatDateTime(lot.endsAt, true)} ({browserTimeZone()}), pelo relógio do servidor
                </p>
              </div>
            )}
            {lot.status === 'scheduled' && (
              <p>
                Abre para lances em <strong>{formatDateTime(lot.startsAt)}</strong>.
              </p>
            )}
            {lot.status === 'ended' && !lot.settled && <Notice tone="info">Tempo esgotado. Aguardando a liquidação pelo servidor.</Notice>}
            {lot.status === 'cancelled' && <Notice tone="warning">Este lote foi cancelado pelo leiloeiro.</Notice>}

            {lot.result ? (
              <div className="lot-result">
                <p className="stat-label">Resultado</p>
                <p className="stat-value">
                  {lot.result.winnerAlias ? formatBrl(lot.result.finalAmountCents ?? 0) : 'Sem lances'}
                </p>
                <p>{lot.result.winnerAlias ? `Arrematado por ${lot.result.winnerAlias}` : 'Encerrado sem vencedor.'}</p>
              </div>
            ) : (
              <dl className="figures">
                <div>
                  <dt>{lot.currentBidCents === null ? 'Lance inicial' : 'Lance atual'}</dt>
                  <dd className="figure-main">{formatBrl(lot.currentBidCents ?? lot.startingBidCents)}</dd>
                </div>
                <div>
                  <dt>Próximo lance mínimo</dt>
                  <dd>{formatBrl(lot.nextMinimumBidCents)}</dd>
                </div>
                <div>
                  <dt>Incremento mínimo</dt>
                  <dd>{formatBrl(lot.minIncrementCents)}</dd>
                </div>
                <div>
                  <dt>Líder</dt>
                  <dd>{lot.leaderAlias ?? '—'}</dd>
                </div>
              </dl>
            )}

            {wallet && (
              <div className="my-wallet">
                <p>
                  <strong>Você ({alias})</strong>
                  {lot.status === 'live' && leadingNow && <span className="badge badge-ok">Você está ganhando</span>}
                </p>
                <p className="small">
                  Disponível: {formatBrl(wallet.availableCents)} · Reservado: {formatBrl(wallet.committedCents)}
                </p>
                {myNotices.map((notice) => (
                  <p key={notice.id} className={notice.kind === 'won' ? 'badge badge-ok' : 'badge badge-warning'} role="status">
                    {notice.kind === 'won' ? 'Você arrematou este lote.' : 'Você foi superado neste lote.'}
                  </p>
                ))}
              </div>
            )}

            {lot.status === 'live' && !user && (
              <p className="small">
                <Link to={`/entrar?next=/lotes/${lot.id}`}>Entre como licitante</Link> para participar.
              </p>
            )}
            {lot.status === 'live' && user?.role === 'seller' && (
              <p className="muted small">Leiloeiros acompanham a disputa, mas não dão lances.</p>
            )}
            {lot.status === 'live' && user?.role === 'bidder' && (
              <PendingFeature step="etapa 15">O formulário de lance desta sala entra no fluxo do licitante.</PendingFeature>
            )}
          </div>

          <p className="small">
            Leiloeiro {lot.sellerAlias} · <Link to={`/lotes/${lot.id}/auditoria`}>Auditoria do histórico</Link>
          </p>
        </div>
      </div>

      <section className="section" aria-labelledby="historico">
        <h2 id="historico">Histórico de lances ({lot.bidCount})</h2>
        {bids.length === 0 ? (
          <EmptyState title="Nenhum lance ainda." />
        ) : (
          <ol className="bid-history" reversed>
            {bids.map((bid) => (
              <li key={bid.seq}>
                <span>
                  {bid.alias}
                  <span className="muted small"> · {formatDateTime(bid.acceptedAt, true)}</span>
                </span>
                <strong>{formatBrl(bid.amountCents)}</strong>
              </li>
            ))}
          </ol>
        )}
      </section>
    </article>
  );
}
