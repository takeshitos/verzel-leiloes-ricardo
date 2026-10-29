import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useApi } from '../api/useApi';
import { ErrorState, Loading, Notice, PageHeader } from '../components/ui';
import { formatBrl } from '../format';
import { getSocket } from '../realtime/socket';
import type { PublicLot } from '../realtime/types';
import { CatalogSearch } from '../seller/CatalogSearch';
import { CreateLotForm } from '../seller/CreateLotForm';
import { SellerLotList } from '../seller/SellerLotList';
import type { CatalogItem, SellerLot } from '../seller/types';

type Summary = {
  totalReceivedCents: number;
  soldLots: number;
  lotsByStatus: { scheduled: number; live: number; ended: number; cancelled: number };
  endedAwaitingSettlement: number;
  settlementBlocked: number;
};

/** Salas que o painel acompanha (o servidor aceita até 30 por conexão). */
const MAX_WATCHED = 25;

/**
 * Painel do leiloeiro: busca no acervo, criação de lote, lotes dele (só dele: a API filtra pela
 * sessão) e total realmente recebido. A busca no museu é independente: se ele cair, o resto segue.
 */
export function SellerPage() {
  const summary = useApi<{ summary: Summary }>('/seller/summary');
  const lots = useApi<{ lots: SellerLot[] }>('/seller/lots');
  const [selected, setSelected] = useState<CatalogItem | null>(null);
  const [created, setCreated] = useState<PublicLot | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const reloadSummary = summary.reload;
  const reloadLots = lots.reload;
  const refresh = useCallback(() => {
    reloadSummary();
    reloadLots();
  }, [reloadSummary, reloadLots]);

  // Lances e encerramentos dos próprios lotes chegam pelas salas; venda liquidada, pela sala privada.
  const watched = (lots.data?.lots ?? [])
    .filter((lot) => lot.status === 'live' || lot.status === 'scheduled')
    .slice(0, MAX_WATCHED)
    .map((lot) => lot.id)
    .join(',');
  useEffect(() => {
    const socket = getSocket();
    const ids = watched ? watched.split(',') : [];
    let timer: number | undefined;
    const refreshSoon = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(refresh, 300); // junta vários eventos seguidos numa leitura só
    };
    const onLotEvent = (event: { lotId: string }) => {
      if (ids.includes(event.lotId)) refreshSoon();
    };
    const subscribe = () => ids.forEach((lotId) => socket.emit('lot.subscribe', { lotId }, () => undefined));
    if (socket.connected) subscribe();
    socket.on('connect', subscribe);
    socket.on('connect', refreshSoon);
    socket.on('lot.updated', onLotEvent);
    socket.on('lot.sold', refreshSoon);
    return () => {
      window.clearTimeout(timer);
      socket.off('connect', subscribe);
      socket.off('connect', refreshSoon);
      socket.off('lot.updated', onLotEvent);
      socket.off('lot.sold', refreshSoon);
      ids.forEach((lotId) => socket.emit('lot.unsubscribe', { lotId }));
    };
  }, [watched, refresh]);

  function handleSelect(item: CatalogItem) {
    setSelected(item);
    setCreated(null);
    window.setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  }

  function handleCreated(lot: PublicLot) {
    setSelected(null);
    setCreated(lot);
    refresh();
  }

  const data = summary.data?.summary;

  return (
    <>
      <PageHeader eyebrow="Leiloeiro" title="Painel">
        <p>Leilão simulado. Você cria lotes com obras do acervo aberto do Cleveland Museum of Art e acompanha o resultado.</p>
      </PageHeader>

      {summary.error && <ErrorState message={summary.error.message} onRetry={summary.reload} />}
      {data && (
        <div className="stat-grid">
          <div className="stat">
            <p className="stat-label">Total recebido</p>
            <p className="stat-value">{formatBrl(data.totalReceivedCents)}</p>
            <p className="muted small">
              {data.soldLots} {data.soldLots === 1 ? 'lote vendido' : 'lotes vendidos'} (só vendas liquidadas)
            </p>
          </div>
          <div className="stat">
            <p className="stat-label">Ao vivo / agendados</p>
            <p className="stat-value">
              {data.lotsByStatus.live} / {data.lotsByStatus.scheduled}
            </p>
          </div>
          <div className="stat">
            <p className="stat-label">Encerrados / cancelados</p>
            <p className="stat-value">
              {data.lotsByStatus.ended} / {data.lotsByStatus.cancelled}
            </p>
            {data.endedAwaitingSettlement > 0 && <p className="muted small">{data.endedAwaitingSettlement} aguardando liquidação</p>}
          </div>
        </div>
      )}
      {data && data.settlementBlocked > 0 && (
        <Notice tone="warning" title="Lotes vencidos sem liquidação">
          {data.settlementBlocked} {data.settlementBlocked === 1 ? 'lote não pôde' : 'lotes não puderam'} ser liquidados. O
          motivo aparece no lote, abaixo.
        </Notice>
      )}

      <section className="section" aria-labelledby="novo-lote">
        <h2 id="novo-lote">Novo lote</h2>
        {created && (
          <Notice tone="success" title="Lote criado">
            <Link to={`/lotes/${created.id}`}>{created.item.title}</Link> está{' '}
            {created.status === 'scheduled' ? 'agendado' : 'ao vivo'} na <Link to="/">vitrine</Link>.
          </Notice>
        )}
        <div ref={formRef}>
          {selected && (
            <CreateLotForm key={selected.externalId} item={selected} onCreated={handleCreated} onCancel={() => setSelected(null)} />
          )}
        </div>
        {/* Escondida (não desmontada) enquanto há obra escolhida: "Trocar obra" volta aos mesmos resultados. */}
        <div hidden={selected !== null}>
          <CatalogSearch onSelect={handleSelect} />
        </div>
      </section>

      <section className="section" aria-labelledby="seus-lotes">
        <h2 id="seus-lotes">Seus lotes</h2>
        {lots.loading && !lots.data && <Loading />}
        {lots.error && <ErrorState message={lots.error.message} onRetry={lots.reload} />}
        {lots.data && <SellerLotList lots={lots.data.lots} onChanged={refresh} />}
      </section>
    </>
  );
}
