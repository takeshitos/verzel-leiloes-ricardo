import { useState } from 'react';
import { Link } from 'react-router';
import { ApiError, apiPost } from '../api/client';
import { ArtworkImage } from '../components/ArtworkImage';
import { LotStatusPill } from '../components/LotStatusPill';
import { EmptyState, Notice } from '../components/ui';
import { formatBrl, formatDateTime } from '../format';
import type { PublicLot } from '../realtime/types';
import type { SellerLot } from './types';

/** Mensagens para as recusas do cancelamento (a API decide sob bloqueio do lote). */
const CANCEL_REFUSAL: Record<string, string> = {
  LOT_HAS_BIDS: 'Não foi possível cancelar: o lote recebeu um lance. Lotes com lance seguem até o fim.',
  LOT_ENDED: 'Não foi possível cancelar: o lote já terminou.',
  LOT_ALREADY_CANCELLED: 'Este lote já estava cancelado.',
};

/** Só sugere cancelar quando faz sentido; quem confere de verdade é a API. */
function canCancel(lot: SellerLot): boolean {
  return (lot.status === 'live' || lot.status === 'scheduled') && lot.bidCount === 0;
}

function lotSummary(lot: SellerLot): string {
  if (lot.status === 'cancelled') return 'Cancelado sem lances';
  if (lot.result) {
    return lot.result.winnerAlias
      ? `Arrematado por ${lot.result.winnerAlias} por ${formatBrl(lot.result.finalAmountCents ?? 0)}`
      : 'Encerrado sem lances (sem vencedor)';
  }
  if (lot.currentBidCents !== null) {
    return `Lance atual ${formatBrl(lot.currentBidCents)} · líder ${lot.leaderAlias} · ${lot.bidCount} ${lot.bidCount === 1 ? 'lance' : 'lances'}`;
  }
  return `Lance inicial ${formatBrl(lot.startingBidCents)} · incremento ${formatBrl(lot.minIncrementCents)} · sem lances`;
}

type Props = { lots: SellerLot[]; onChanged: () => void };

export function SellerLotList({ lots, onChanged }: Props) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ lotId: string; tone: 'success' | 'error'; message: string } | null>(null);

  async function cancel(lot: SellerLot) {
    setCancelling(lot.id);
    setFeedback(null);
    try {
      await apiPost<{ lot: PublicLot }>(`/lots/${lot.id}/cancel`);
      setFeedback({ lotId: lot.id, tone: 'success', message: 'Lote cancelado. Ele saiu da vitrine.' });
    } catch (error) {
      const message =
        error instanceof ApiError ? (CANCEL_REFUSAL[error.code] ?? error.message) : 'Erro inesperado ao cancelar.';
      setFeedback({ lotId: lot.id, tone: 'error', message });
    } finally {
      setCancelling(null);
      setConfirming(null);
      onChanged(); // relê do servidor: o estado mostrado é sempre o do banco
    }
  }

  if (lots.length === 0) return <EmptyState title="Você ainda não criou lotes.">Busque uma obra acima para criar o primeiro.</EmptyState>;

  return (
    <ul className="participation-list">
      {lots.map((lot) => (
        <li key={lot.id} className="participation">
          <ArtworkImage className="participation-image" src={lot.item.image?.url ?? null} alt={lot.item.title} />
          <div className="participation-body seller-lot">
            <div className="participation-top">
              <LotStatusPill lot={lot} />
            </div>
            <h3 className="participation-title">
              <Link to={`/lotes/${lot.id}`}>{lot.item.title}</Link>
            </h3>
            <p className="small">{lotSummary(lot)}</p>
            <p className="muted small">
              {formatDateTime(lot.startsAt)} até {formatDateTime(lot.endsAt)}
            </p>
            {lot.settlementIssue && (
              <p className="small status-warning">
                {lot.settlementIssue.statusLabel}: {lot.settlementIssue.reason}
              </p>
            )}
            <p className="small seller-lot-links">
              {lot.receiptToken && <Link to={`/comprovantes/${lot.receiptToken}`}>Comprovante</Link>}
              <Link to={`/lotes/${lot.id}/auditoria`}>Auditoria</Link>
            </p>

            {feedback?.lotId === lot.id && <Notice tone={feedback.tone}>{feedback.message}</Notice>}

            {canCancel(lot) &&
              (confirming === lot.id ? (
                <div className="confirm-box" role="group" aria-label={`Confirmar cancelamento de ${lot.item.title}`}>
                  <p className="small">
                    Cancelar este lote? Ele sai da vitrine e não poderá ser reaberto. Se um lance chegar antes, o
                    cancelamento é recusado.
                  </p>
                  <div className="form-actions">
                    <button
                      type="button"
                      className="button button-danger button-small"
                      onClick={() => cancel(lot)}
                      disabled={cancelling === lot.id}
                    >
                      {cancelling === lot.id ? 'Cancelando...' : 'Sim, cancelar lote'}
                    </button>
                    <button type="button" className="button button-secondary button-small" onClick={() => setConfirming(null)}>
                      Não, manter
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" className="button button-secondary button-small" onClick={() => setConfirming(lot.id)}>
                  Cancelar lote
                </button>
              ))}
          </div>
        </li>
      ))}
    </ul>
  );
}
