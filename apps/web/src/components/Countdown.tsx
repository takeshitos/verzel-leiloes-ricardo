import { useEffect, useRef, useState } from 'react';
import { formatDuration } from '../format';
import { remainingMs } from '../realtime/lot-sync';

type CountdownProps = {
  /** Fim atual do lote (muda quando há prorrogação). */
  endsAt: string;
  /** Diferença relógio do servidor − relógio do navegador. */
  offsetMs: number;
  /** Versão curta, para cards. */
  compact?: boolean;
};

/**
 * Contagem regressiva pelo relógio do servidor. É só visual: quem aceita lance e encerra o
 * lote é o backend. Quando o fim muda (prorrogação), recalcula e avisa por alguns segundos.
 */
export function Countdown({ endsAt, offsetMs, compact = false }: CountdownProps) {
  const [now, setNow] = useState(() => Date.now());
  const [extended, setExtended] = useState(false);
  const previousEnd = useRef(endsAt);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), compact ? 1_000 : 250);
    return () => window.clearInterval(timer);
  }, [compact]);

  useEffect(() => {
    if (Date.parse(endsAt) > Date.parse(previousEnd.current)) {
      previousEnd.current = endsAt;
      const show = window.setTimeout(() => setExtended(true), 0);
      const hide = window.setTimeout(() => setExtended(false), 5_000);
      return () => {
        window.clearTimeout(show);
        window.clearTimeout(hide);
      };
    }
    previousEnd.current = endsAt;
  }, [endsAt]);

  const left = remainingMs(endsAt, offsetMs, now);
  const finalMinutes = left > 0 && left <= 120_000;
  const text = left > 0 ? formatDuration(left) : 'Encerrando...';

  if (compact) {
    return (
      <span className={`countdown-compact${finalMinutes ? ' is-final' : ''}`}>
        {text}
        {extended && <span className="sr-only"> (prorrogado)</span>}
      </span>
    );
  }

  return (
    <p className={`countdown${finalMinutes ? ' is-final' : ''}`} aria-live="off">
      <span className="countdown-value">{text}</span>
      {extended && (
        <span className="countdown-extended" role="status">
          Prorrogado
        </span>
      )}
    </p>
  );
}
