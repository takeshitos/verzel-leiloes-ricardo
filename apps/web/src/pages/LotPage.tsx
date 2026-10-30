import { Link, useParams } from 'react-router';
import { useApi } from '../api/useApi';
import { useAuth } from '../auth/useAuth';
import { BidForm } from '../bidder/BidForm';
import { ArtworkImage } from '../components/ArtworkImage';
import { ConnectionBadge } from '../components/ConnectionBadge';
import { Countdown } from '../components/Countdown';
import { LotStatusPill } from '../components/LotStatusPill';
import { EmptyState, ErrorState, Loading, Notice } from '../components/ui';
import { browserTimeZone, formatBrl, formatDateTime } from '../format';
import { myPosition, myStanding, type MyStanding } from '../realtime/lot-sync';
import { useLiveLot } from '../realtime/useLiveLot';
import { useMyWallet } from '../realtime/useMyWallet';

const STANDING: Partial<Record<MyStanding, { label: string; tone: string }>> = {
  leading: { label: 'Você está ganhando', tone: 'ok' },
  outbid: { label: 'Você foi superado', tone: 'warning' },
  awaiting: { label: 'Encerrado: aguardando liquidação', tone: 'neutral' },
  won: { label: 'Você arrematou este lote', tone: 'ok' },
  lost: { label: 'Você não venceu este lote', tone: 'neutral' },
};

/**
 * Sala do lote em tempo real: estado do servidor, cronômetro, histórico, posição do usuário,
 * "você está ganhando" / "você foi superado" e o formulário de lance.
 */
export function LotPage() {
  const { id = '' } = useParams();
  // key: ao trocar de lote, a sala começa do zero (estado, versão e histórico).
  return <LotRoom key={id} lotId={id} />;
}

function LotRoom({ lotId }: { lotId: string }) {
  const { user } = useAuth();
  const { lot, bids, offsetMs, connection, error, resync } = useLiveLot(lotId);
  const { wallet, alias } = useMyWallet();
  // Situação do usuário: sempre derivada do estado do servidor (corrige-se sozinha ao reconectar).
  const standing = lot ? myStanding(lot, bids, alias) : 'none';
  const position = lot?.status === 'live' ? myPosition(bids, alias) : null;
  // O link do comprovante só existe para o vencedor; a API de participações o devolve.
  const participations = useApi<{ participations: { lot: { id: string }; receiptToken: string | null }[] }>(
    standing === 'won' ? '/me/participations' : null,
  );
  const receiptToken = participations.data?.participations.find((item) => item.lot.id === lotId)?.receiptToken ?? null;

  if (!lot) {
    return error ? <ErrorState message={error.message} onRetry={error.status === 404 ? undefined : resync} /> : <Loading label="Carregando o lote..." />;
  }

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
            <div className="lot-room-badges" data-tour="sala-estado">
              <LotStatusPill lot={lot} />
              <ConnectionBadge status={connection} />
            </div>
            <h1>{lot.item.title}</h1>
            {lot.item.creators && <p className="lot-creator">{lot.item.creators}</p>}
            {details.length > 0 && <p className="muted small">{details.join(' · ')}</p>}
          </div>

          {error && <Notice tone="warning">Última atualização falhou: {error.message}</Notice>}

          <div className="card lot-panel" aria-live="polite" data-tour="sala-painel">
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
              <div className="lot-result" data-tour="sala-resultado">
                <p className="stat-label">Resultado</p>
                <p className="stat-value">
                  {lot.result.winnerAlias ? formatBrl(lot.result.finalAmountCents ?? 0) : 'Sem lances'}
                </p>
                <p>{lot.result.winnerAlias ? `Arrematado por ${lot.result.winnerAlias}` : 'Encerrado sem vencedor.'}</p>
              </div>
            ) : (
              <dl className="figures" data-tour="sala-valores">
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

            {user?.role === 'bidder' && alias && (
              <div className="my-wallet" data-tour="minha-situacao">
                <p className="my-standing">
                  <strong>Você ({alias})</strong>
                  {STANDING[standing] && (
                    <span className={`badge badge-${STANDING[standing]!.tone}`} role="status">
                      {STANDING[standing]!.label}
                    </span>
                  )}
                </p>
                {position && (
                  <p className="small">
                    Sua posição: {position.position}º de {position.participants}{' '}
                    {position.participants === 1 ? 'participante' : 'participantes'} (pelo melhor lance de cada um)
                  </p>
                )}
                {standing === 'none' && lot.status === 'live' && <p className="small muted">Você ainda não ofertou neste lote.</p>}
                {wallet && (
                  <p className="small">
                    Disponível: {formatBrl(wallet.availableCents)} · Reservado: {formatBrl(wallet.committedCents)} ·{' '}
                    <Link to="/carteira">Carteira</Link>
                  </p>
                )}
                {standing === 'won' && (
                  <p className="small">
                    {receiptToken ? (
                      <Link to={`/comprovantes/${receiptToken}`}>Ver o comprovante do arremate</Link>
                    ) : (
                      'O comprovante aparece em Participações assim que for gerado.'
                    )}
                  </p>
                )}
              </div>
            )}

            {lot.status === 'live' && user?.role === 'bidder' && alias && (
              <BidForm lot={lot} bids={bids} alias={alias} availableCents={wallet?.availableCents ?? null} resync={resync} />
            )}
            {lot.status === 'live' && !user && (
              <p className="small" data-tour="login-to-bid">
                <Link to={`/entrar?next=/lotes/${lot.id}`}>Entre como licitante</Link> para participar.
              </p>
            )}
            {lot.status === 'live' && user?.role === 'seller' && (
              <p className="muted small" data-tour="seller-note">Leiloeiros acompanham a disputa, mas não dão lances.</p>
            )}
          </div>

          <p className="small" data-tour="sala-auditoria">
            Leiloeiro {lot.sellerAlias} · <Link to={`/lotes/${lot.id}/auditoria`}>Auditoria do histórico</Link>
          </p>
        </div>
      </div>

      <section className="section" aria-labelledby="historico" data-tour="sala-historico">
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
