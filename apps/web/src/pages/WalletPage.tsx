import { useEffect } from 'react';
import { Link } from 'react-router';
import { useApi } from '../api/useApi';
import { DepositForm } from '../bidder/DepositForm';
import { EmptyState, ErrorState, Loading, PageHeader } from '../components/ui';
import { formatBrl, formatDateTime } from '../format';
import { getSocket } from '../realtime/socket';

type Entry = { kind: 'deposit' | 'settlement_debit' | 'settlement_credit'; amountCents: number; lotId: string | null; createdAt: string };
type WalletView = { totalCents: number; committedCents: number; availableCents: number; simulated: true; recentEntries: Entry[] };

const ENTRY_LABEL: Record<Entry['kind'], string> = {
  deposit: 'Depósito simulado',
  settlement_debit: 'Pagamento de arremate',
  settlement_credit: 'Recebimento de venda',
};

/** Carteira do licitante: total, reservado e disponível sempre lidos do servidor; depósito simulado. */
export function WalletPage() {
  const { data, error, loading, reload } = useApi<{ wallet: WalletView }>('/wallet');

  // Saldo mudou (lance, superação, liquidação, depósito): a sala privada avisa e a tela relê.
  useEffect(() => {
    const socket = getSocket();
    socket.on('wallet.updated', reload);
    socket.on('connect', reload);
    return () => {
      socket.off('wallet.updated', reload);
      socket.off('connect', reload);
    };
  }, [reload]);

  return (
    <>
      <PageHeader eyebrow="Licitante" title="Carteira">
        <p>Saldo simulado. Ao liderar um lote, o valor do seu lance fica reservado até você ser superado ou o lote encerrar.</p>
      </PageHeader>

      {loading && !data && <Loading />}
      {error && <ErrorState message={error.message} onRetry={reload} />}

      {data && (
        <>
          <div className="stat-grid">
            <div className="stat">
              <p className="stat-label">Disponível para lances</p>
              <p className="stat-value">{formatBrl(data.wallet.availableCents)}</p>
            </div>
            <div className="stat">
              <p className="stat-label">Reservado em lotes que você lidera</p>
              <p className="stat-value">{formatBrl(data.wallet.committedCents)}</p>
            </div>
            <div className="stat">
              <p className="stat-label">Total</p>
              <p className="stat-value">{formatBrl(data.wallet.totalCents)}</p>
            </div>
          </div>

          <p className="muted small explain">
            <strong>Como funciona a reserva:</strong> quando você lidera um lote, o valor do seu lance sai do disponível e
            fica reservado. Se alguém cobrir, a reserva volta na hora. Se você vencer, o valor reservado é debitado do total
            no encerramento. Assim você nunca oferta mais do que tem, mesmo disputando vários lotes.
          </p>

          <DepositForm onDone={reload} />

          <section className="section">
            <h2>Últimos lançamentos</h2>
            {data.wallet.recentEntries.length === 0 ? (
              <EmptyState title="Nenhum lançamento ainda." />
            ) : (
              <ul className="entry-list">
                {data.wallet.recentEntries.map((entry, index) => (
                  <li key={`${entry.createdAt}-${index}`}>
                    <span>
                      {ENTRY_LABEL[entry.kind]}
                      {entry.lotId && (
                        <>
                          {' · '}
                          <Link to={`/lotes/${entry.lotId}`}>ver lote</Link>
                        </>
                      )}
                      <span className="muted small"> · {formatDateTime(entry.createdAt)}</span>
                    </span>
                    <strong className={entry.kind === 'settlement_debit' ? 'amount-out' : 'amount-in'}>
                      {entry.kind === 'settlement_debit' ? '−' : '+'}
                      {formatBrl(entry.amountCents)}
                    </strong>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  );
}
