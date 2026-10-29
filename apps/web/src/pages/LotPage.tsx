import { useParams } from 'react-router';
import { ArtworkImage } from '../components/ArtworkImage';
import { ConnectionBadge } from '../components/ConnectionBadge';
import { Countdown } from '../components/Countdown';
import { formatBrl, formatDateTime } from '../format';
import { useLiveLot } from '../realtime/useLiveLot';
import { useMyWallet } from '../realtime/useMyWallet';
import type { PublicLot } from '../realtime/types';

const STATUS_LABEL: Record<PublicLot['status'], string> = {
  scheduled: 'Agendado',
  live: 'Ao vivo',
  ended: 'Encerrado',
  cancelled: 'Cancelado',
};

/**
 * Sala do lote em tempo real (etapa 12). Mostra o estado do servidor e o atualiza sem recarregar.
 * Formulário de lance e o visual definitivo da sala entram nas etapas 13 e 15.
 */
export function LotPage() {
  const { id = '' } = useParams();
  // key: ao trocar de lote, a sala começa do zero (estado, versão e histórico).
  return <LotRoom key={id} lotId={id} />;
}

function LotRoom({ lotId }: { lotId: string }) {
  const { lot, bids, offsetMs, connection, error } = useLiveLot(lotId);
  const { wallet, alias, notices } = useMyWallet();

  if (!lot) {
    return (
      <section aria-live="polite">
        {error ? <p className="status-error">{error.message}</p> : <p>Carregando o lote...</p>}
      </section>
    );
  }

  const leadingNow = alias !== null && lot.leaderAlias === alias;
  // "Superado" deixa de valer quando a pessoa volta a liderar.
  const myNotices = notices.filter((notice) => notice.lotId === lot.id && !(notice.kind === 'outbid' && leadingNow));

  return (
    <section className="lot-room">
      <header className="lot-room-header">
        <div>
          <p className="lot-status">{lot.settled ? 'Encerrado e liquidado' : STATUS_LABEL[lot.status]}</p>
          <h1>{lot.item.title}</h1>
          {lot.item.creators && <p className="muted">{lot.item.creators}</p>}
        </div>
        <ConnectionBadge status={connection} />
      </header>

      {error && <p className="status-error">Última atualização falhou: {error.message}</p>}

      <div className="lot-room-grid">
        <ArtworkImage
          className="lot-room-image"
          src={lot.item.image?.url ?? null}
          alt={lot.item.title}
          width={lot.item.image?.width}
          height={lot.item.image?.height}
        />

        <div className="card lot-room-panel" aria-live="polite">
          {lot.status === 'live' && (
            <>
              <p className="muted">Termina em</p>
              <Countdown endsAt={lot.endsAt} offsetMs={offsetMs} />
              <p className="muted small">Fim: {formatDateTime(lot.endsAt)} (horário do servidor)</p>
            </>
          )}
          {lot.status === 'scheduled' && <p>Começa em {formatDateTime(lot.startsAt)}.</p>}
          {lot.status === 'ended' && !lot.settled && <p>Tempo esgotado. Aguardando a liquidação pelo servidor...</p>}
          {lot.status === 'cancelled' && <p>Este lote foi cancelado pelo leiloeiro.</p>}

          {lot.result ? (
            <p className="lot-result">
              {lot.result.winnerAlias
                ? `Vencedor: ${lot.result.winnerAlias} por ${formatBrl(lot.result.finalAmountCents ?? 0)}`
                : 'Encerrado sem lances.'}
            </p>
          ) : (
            <dl className="lot-numbers">
              <div>
                <dt>Lance atual</dt>
                <dd>{lot.currentBidCents === null ? 'Nenhum lance' : formatBrl(lot.currentBidCents)}</dd>
              </div>
              <div>
                <dt>Próximo lance mínimo</dt>
                <dd>{formatBrl(lot.nextMinimumBidCents)}</dd>
              </div>
              <div>
                <dt>Líder</dt>
                <dd>{lot.leaderAlias ?? '—'}</dd>
              </div>
              <div>
                <dt>Lances</dt>
                <dd>{lot.bidCount}</dd>
              </div>
            </dl>
          )}

          {wallet && (
            <div className="my-wallet">
              <p>
                <strong>Você ({alias})</strong>
                {lot.status === 'live' && lot.bidCount > 0 && (leadingNow ? ' está ganhando.' : '')}
              </p>
              <p className="small">
                Disponível: {formatBrl(wallet.availableCents)} · Reservado: {formatBrl(wallet.committedCents)}
              </p>
              {myNotices.map((notice) => (
                <p key={notice.id} className={notice.kind === 'won' ? 'status-ok' : 'status-error'} role="status">
                  {notice.kind === 'won' ? 'Você venceu este lote.' : 'Você foi superado neste lote.'}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>

      <h2>Histórico de lances</h2>
      {bids.length === 0 ? (
        <p className="muted">Nenhum lance ainda.</p>
      ) : (
        <ol className="bid-history" reversed>
          {bids.map((bid) => (
            <li key={bid.seq}>
              <strong>{formatBrl(bid.amountCents)}</strong> · {bid.alias} · {formatDateTime(bid.acceptedAt)}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
