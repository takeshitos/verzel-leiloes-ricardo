import { Link } from 'react-router';
import { formatBrl, formatDateTime } from '../format';
import type { PublicLot } from '../realtime/types';
import { ArtworkImage } from './ArtworkImage';
import { Countdown } from './Countdown';
import { LotStatusPill } from './LotStatusPill';

/** Card da vitrine: imagem, título, atributos essenciais, valor e horário/estado. */
export function LotCard({ lot, offsetMs }: { lot: PublicLot; offsetMs: number }) {
  const attributes = [lot.item.creationDate, lot.item.technique].filter(Boolean).join(' · ');

  return (
    <article className="lot-card" data-tour="lot-card">
      <Link to={`/lotes/${lot.id}`} className="lot-card-link" aria-label={`${lot.item.title}: abrir sala do lote`}>
        <div className="lot-card-media">
          <ArtworkImage
            className="lot-card-image"
            src={lot.item.image?.url ?? null}
            alt={lot.item.title}
            width={lot.item.image?.width}
            height={lot.item.image?.height}
          />
          <LotStatusPill lot={lot} className="lot-card-pill" />
        </div>
        <div className="lot-card-body">
          <h3 className="lot-card-title">{lot.item.title}</h3>
          {lot.item.creators && <p className="lot-card-creator">{lot.item.creators}</p>}
          {attributes && <p className="lot-card-attributes">{attributes}</p>}

          <dl className="lot-card-figures">
            {lot.status === 'ended' ? (
              <div>
                <dt>Resultado</dt>
                <dd>
                  {!lot.settled
                    ? 'Aguardando liquidação'
                    : lot.result?.winnerAlias
                      ? formatBrl(lot.result.finalAmountCents ?? 0)
                      : 'Sem lances'}
                </dd>
              </div>
            ) : (
              <div>
                <dt>{lot.currentBidCents === null ? 'Lance inicial' : 'Lance atual'}</dt>
                <dd>{formatBrl(lot.currentBidCents ?? lot.startingBidCents)}</dd>
              </div>
            )}
            <div>
              <dt>{lot.status === 'scheduled' ? 'Começa em' : lot.status === 'live' ? 'Termina em' : 'Encerrou em'}</dt>
              <dd>
                {lot.status === 'live' ? (
                  <Countdown endsAt={lot.endsAt} offsetMs={offsetMs} compact />
                ) : (
                  formatDateTime(lot.status === 'scheduled' ? lot.startsAt : lot.endsAt)
                )}
              </dd>
            </div>
          </dl>
          <p className="lot-card-meta">
            {lot.bidCount === 1 ? '1 lance' : `${lot.bidCount} lances`} · leiloeiro {lot.sellerAlias}
          </p>
        </div>
      </Link>
    </article>
  );
}
