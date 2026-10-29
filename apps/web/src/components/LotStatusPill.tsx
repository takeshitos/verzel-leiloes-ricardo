import type { PublicLot } from '../realtime/types';

type PillLot = Pick<PublicLot, 'status' | 'settled'>;

/** Rótulo do estado do lote, igual em toda a interface. */
function lotStatusLabel(lot: PillLot): string {
  if (lot.status === 'ended') return lot.settled ? 'Encerrado' : 'Encerrando';
  return { scheduled: 'Agendado', live: 'Ao vivo', cancelled: 'Cancelado' }[lot.status];
}

export function LotStatusPill({ lot, className = '' }: { lot: PillLot; className?: string }) {
  const tone = lot.status === 'ended' && !lot.settled ? 'closing' : lot.status;
  return <span className={`pill pill-${tone} ${className}`.trim()}>{lotStatusLabel(lot)}</span>;
}
