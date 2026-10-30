import { Link, useParams } from 'react-router';
import { useApi } from '../api/useApi';
import { ArtworkImage } from '../components/ArtworkImage';
import { CopyLinkButton } from '../components/CopyLinkButton';
import { ErrorState, Loading } from '../components/ui';
import { formatBrl, formatDateTime } from '../format';
import { NotFoundPage } from './NotFoundPage';

/** GET /api/receipts/:token → receipt: snapshot congelado na liquidação (só pseudônimos). */
type Receipt = {
  version: number;
  reference: string;
  lotId: string;
  item: {
    title: string;
    creators: string | null;
    creationDate: string | null;
    provider: string;
    externalId: string;
    sourceUrl: string | null;
    license: string;
    imageUrl: string | null;
  };
  amountCents: number;
  currency: 'BRL';
  settledAt: string;
  winnerAlias: string;
  sellerAlias: string;
  winningBid: { seq: number; acceptedAt: string };
  audit: { bidCount: number; lastHash: string; statusAtSettlement: 'intact' };
};

/**
 * Comprovante público por link (token imprevisível). Abre sem login e mostra só o que foi
 * congelado na liquidação: nada de email, nome real ou dados da carteira.
 */
export function ReceiptPage() {
  const { token = '' } = useParams();
  const { data, error, loading, reload } = useApi<{ receipt: Receipt }>(`/receipts/${encodeURIComponent(token)}`);

  if (loading && !data) return <Loading label="Carregando o comprovante..." />;
  // Token inválido ou desconhecido: a mesma página de não encontrado, sem detalhes.
  if (error?.status === 404) {
    return <NotFoundPage title="Comprovante não encontrado" message="Confira se o link foi copiado inteiro." />;
  }
  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (!data) return null;

  const receipt = data.receipt;

  return (
    <article className="receipt-page">
      <header className="receipt-header">
        <div>
          <p className="eyebrow">Comprovante de arremate · leilão simulado</p>
          <h1>{receipt.item.title}</h1>
          <p className="muted">{[receipt.item.creators, receipt.item.creationDate].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="receipt-actions no-print" data-tour="comprovante-acoes">
          <CopyLinkButton path={`/comprovantes/${token}`} label="Copiar link do comprovante" />
          <button type="button" className="button button-secondary button-small" onClick={() => window.print()}>
            Imprimir
          </button>
        </div>
      </header>

      <div className="card receipt">
        <div className="receipt-grid-main">
          <ArtworkImage className="receipt-image" src={receipt.item.imageUrl} alt={receipt.item.title} />
          <dl className="receipt-grid" data-tour="comprovante-dados">
            <div className="receipt-total" data-tour="comprovante-valor">
              <dt>Valor final</dt>
              <dd className="receipt-amount">{formatBrl(receipt.amountCents)}</dd>
            </div>
            <div>
              <dt>Identificador da transação</dt>
              <dd>
                <code>{receipt.reference}</code>
              </dd>
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
                #{receipt.winningBid.seq}, aceito em {formatDateTime(receipt.winningBid.acceptedAt, true)}
              </dd>
            </div>
            <div>
              <dt>Lote</dt>
              <dd>
                <code>{receipt.lotId}</code>
              </dd>
            </div>
            <div>
              <dt>Obra</dt>
              <dd>
                {receipt.item.provider}, nº {receipt.item.externalId} ({receipt.item.license})
                {receipt.item.sourceUrl && (
                  <>
                    {' · '}
                    <a href={receipt.item.sourceUrl} target="_blank" rel="noreferrer" className="no-print">
                      ver no museu
                    </a>
                  </>
                )}
              </dd>
            </div>
          </dl>
        </div>

        <div className="receipt-audit" data-tour="comprovante-auditoria">
          <p className="small">
            <strong>Auditoria na liquidação: ÍNTEGRO</strong> ({receipt.audit.bidCount}{' '}
            {receipt.audit.bidCount === 1 ? 'lance' : 'lances'}; último hash <code>{receipt.audit.lastHash.slice(0, 16)}…</code>
            ). A liquidação só acontece com o histórico íntegro.{' '}
            <Link to={`/lotes/${receipt.lotId}/auditoria`} className="no-print">
              Conferir a auditoria agora
            </Link>
          </p>
        </div>
      </div>

      <p className="muted small">
        Leilão fictício para teste técnico: nenhum valor é real e a obra não foi vendida. Dados da obra: acervo aberto do
        Cleveland Museum of Art, sem relação com este projeto. Comprovante versão {receipt.version}.
      </p>
      <p className="no-print small">
        <Link to={`/lotes/${receipt.lotId}`}>Ver a sala do lote</Link>
      </p>
    </article>
  );
}
