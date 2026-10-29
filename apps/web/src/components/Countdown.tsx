import { useEffect, useRef, useState } from 'react';
import { formatDuration } from '../format';
import { remainingMs } from '../realtime/lot-sync';

type CountdownProps = {
  /** Fim atual do lote (muda quando há prorrogação). */
  endsAt: string;
  /** Diferença relógio do servidor − relógio do navegador. */
  offsetMs: number;
};

/**
 * Contagem regressiva pelo relógio do servidor. É só visual: quem aceita lance e encerra o
 * lote é o backend. Quando o fim muda (prorrogação), recalcula e avisa por alguns segundos.
 */
export function Countdown({ endsAt, offsetMs }: CountdownProps) {
  const [now, setNow] = useState(() => Date.now());
  const [extended, setExtended] = useState(false);
  const previousEnd = useRef(endsAt);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (Date.parse(endsAt) > Date.parse(previousEnd.current)) {
      setExtended(true);
      const timer = window.setTimeout(() => setExtended(false), 5_000);
      previousEnd.current = endsAt;
      return () => window.clearTimeout(timer);
    }
    previousEnd.current = endsAt;
  }, [endsAt]);

  const left = remainingMs(endsAt, offsetMs, now);
  return (
    <p className={`countdown${left <= 120_000 ? ' countdown-final' : ''}`} aria-live="off">
      <span className="countdown-value">{left > 0 ? formatDuration(left) : 'Encerrando...'}</span>
      {extended && (
        <span className="countdown-extended" role="status">
          Prorrogado
        </span>
      )}
    </p>
  );
}
