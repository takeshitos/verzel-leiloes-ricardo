import { Link, useParams } from 'react-router';
import { useApi } from '../api/useApi';
import { EmptyState, ErrorState, Loading, PageHeader, PendingFeature } from '../components/ui';
import { formatBrl, formatDateTime } from '../format';

type AuditReport = {
  status: 'intact' | 'tampered' | 'pending' | 'unavailable';
  statusLabel: string;
  reason: string;
  checkedAt: string;
  bidCount: number;
  bids: { seq: number; alias: string; amountCents: number; acceptedAt: string; hash: string }[];
};

const TONE: Record<AuditReport['status'], string> = {
  intact: 'ok',
  tampered: 'error',
  pending: 'warning',
  unavailable: 'warning',
};

/** Auditoria pública do lote: o servidor verifica na hora e devolve o estado. */
export function AuditPage() {
  const { id = '' } = useParams();
  const { data, error, loading, reload } = useApi<{ audit: AuditReport }>(`/lots/${id}/audit`);

  return (
    <>
      <PageHeader eyebrow="Auditoria pública" title="Histórico verificável">
        <p>
          <Link to={`/lotes/${id}`}>Voltar para a sala do lote</Link>
        </p>
      </PageHeader>

      {loading && !data && <Loading label="Verificando o histórico..." />}
      {error && <ErrorState message={error.message} onRetry={reload} />}

      {data && (
        <>
          <div className={`audit-status audit-${TONE[data.audit.status]}`} role="status">
            <p className="audit-label">{data.audit.statusLabel}</p>
            <p>{data.audit.reason}</p>
            <p className="muted small">Verificado em {formatDateTime(data.audit.checkedAt, true)}</p>
            <button type="button" className="button button-secondary" onClick={reload}>
              Verificar de novo
            </button>
          </div>

          <section className="section">
            <h2>Lances ({data.audit.bidCount})</h2>
            {data.audit.bids.length === 0 ? (
              <EmptyState title="Nenhum lance neste lote." />
            ) : (
              <ol className="bid-history">
                {data.audit.bids.map((bid) => (
                  <li key={bid.seq}>
                    <span>
                      #{bid.seq} · {bid.alias} · {formatDateTime(bid.acceptedAt, true)}
                    </span>
                    <strong>{formatBrl(bid.amountCents)}</strong>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <PendingFeature step="etapa 16">
            A explicação de como conferir (hashes, assinatura e âncora) e a chave pública ficam na página de
            auditoria completa.
          </PendingFeature>
        </>
      )}
    </>
  );
}
