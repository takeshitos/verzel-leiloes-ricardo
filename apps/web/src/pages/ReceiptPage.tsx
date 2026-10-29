import { Link, useParams } from 'react-router';
import { useApi } from '../api/useApi';
import { ErrorState, Loading, PageHeader, PendingFeature } from '../components/ui';
import { formatBrl, formatDateTime } from '../format';

type Receipt = {
  reference: string;
  lotId: string;
  item: { title: string; creators: string | null; provider: string; sourceUrl: string | null; license: string };
  amountCents: number;
  settledAt: string;
  winnerAlias: string;
  sellerAlias: string;
  winningBid: { seq: number; acceptedAt: string };
};

/** Comprovante público por link (token). Mostra só pseudônimos, nunca dados pessoais. */
export function ReceiptPage() {
  const { token = '' } = useParams();
  const { data, error, loading, reload } = useApi<{ receipt: Receipt }>(`/receipts/${encodeURIComponent(token)}`);

  if (loading && !data) return <Loading label="Carregando o comprovante..." />;
  if (error) {
    return (
      <>
        <PageHeader title="Comprovante" />
        <ErrorState message={error.message} onRetry={error.status === 404 ? undefined : reload} />
      </>
    );
  }
  if (!data) return null;
  const receipt = data.receipt;

  return (
    <>
      <PageHeader eyebrow={`Comprovante ${receipt.reference}`} title={receipt.item.title}>
        <p>Leilão simulado. Nenhum valor é real.</p>
      </PageHeader>
      <div className="card receipt">
        <dl className="receipt-grid">
          <div>
            <dt>Valor arrematado</dt>
            <dd className="receipt-amount">{formatBrl(receipt.amountCents)}</dd>
          </div>
          <div>
            <dt>Liquidado em</dt>
            <dd>{formatDateTime(receipt.settledAt, true)}</dd>
          </div>
          <div>
            <dt>Arrematante</dt>
            <dd>{receipt.winnerAlias}</dd>
          </div>
          <div>
            <dt>Leiloeiro</dt>
            <dd>{receipt.sellerAlias}</dd>
          </div>
          <div>
            <dt>Lance vencedor</dt>
            <dd>
              #{receipt.winningBid.seq} em {formatDateTime(receipt.winningBid.acceptedAt, true)}
            </dd>
          </div>
          <div>
            <dt>Obra</dt>
            <dd>
              {receipt.item.creators ?? 'Autoria desconhecida'} · {receipt.item.provider} ({receipt.item.license})
            </dd>
          </div>
        </dl>
        <p className="small">
          <Link to={`/lotes/${receipt.lotId}`}>Ver o lote</Link> · <Link to={`/lotes/${receipt.lotId}/auditoria`}>Auditoria</Link>
        </p>
      </div>
      <PendingFeature step="etapa 16">Versão para imprimir e compartilhar do comprovante.</PendingFeature>
    </>
  );
}
