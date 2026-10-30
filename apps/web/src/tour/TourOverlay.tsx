import { useEffect, useId, useRef, useState } from 'react';
import { MISSING_DEFAULT } from './content';
import { useTour } from './context';
import { findTarget, firstLotRoomPath, prefersReducedMotion } from './dom';
import { isLastStep, placeCard, progressLabel, type CardPlacement, type Rect, type RunningTour, type TourStep } from './logic';

type Layout = {
  /** Etapa a que a medição se refere (evita mostrar "não está na tela" antes de medir). */
  step: TourStep | null;
  rect: Rect | null;
  placement: CardPlacement;
  /** "Continuar para a sala" só aparece se houver um lote na vitrine. */
  hasLotToOpen: boolean;
};

const SPOT_PADDING = 6;

/**
 * Destaque + cartão da etapa atual. Não é modal: a página continua utilizável (o escurecimento
 * não captura cliques) e o foco não fica preso. Esc fecha. O leilão não pausa.
 */
export function TourOverlay() {
  const { running } = useTour();
  if (!running) return null;
  return <TourCard running={running} />;
}

function TourCard({ running }: { running: RunningTour }) {
  const { runningTour, pageTour, next, prev, close, continueToNextArea } = useTour();
  const step = running.steps[running.index];
  const last = isLastStep(running);
  const cardRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const [layout, setLayout] = useState<Layout>({
    step: null,
    rect: null,
    placement: { mode: 'center' },
    hasLotToOpen: false,
  });

  // Ao abrir o tour, o foco vai para o cartão (sem prender: Tab segue para a página).
  useEffect(() => {
    cardRef.current?.focus();
  }, []);

  // Esc fecha o tour de qualquer lugar da página.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !event.defaultPrevented) close('dismissed');
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [close]);

  // A cada etapa: rola até o elemento e acompanha a posição dele (rolagem, redimensionamento e
  // mudanças da página em tempo real, como um lance novo que aumenta o histórico).
  useEffect(() => {
    const element = step.target ? findTarget(step.target) : null;
    if (element) {
      element.scrollIntoView({
        block: window.innerWidth < 640 ? 'start' : 'center',
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      });
    }
    // Medição direta (sem requestAnimationFrame, que o navegador pausa em abas ocultas).
    const measure = () => {
      const target = step.target ? findTarget(step.target) : null;
      const box = target?.getBoundingClientRect();
      const rect = box
        ? {
            top: box.top,
            left: box.left,
            width: box.width,
            height: box.height,
          }
        : null;
      const card = cardRef.current?.getBoundingClientRect() ?? {
        width: 360,
        height: 240,
      };
      const placement = placeCard(rect, { width: window.innerWidth, height: window.innerHeight }, card);
      const hasLotToOpen = firstLotRoomPath() !== null;
      setLayout((previous) =>
        previous.step === step &&
        previous.hasLotToOpen === hasLotToOpen &&
        JSON.stringify([previous.rect, previous.placement]) === JSON.stringify([rect, placement])
          ? previous
          : { step, rect, placement, hasLotToOpen },
      );
    };
    const first = window.setTimeout(measure, 0);
    const timer = window.setInterval(measure, 300);
    window.addEventListener('scroll', measure, {
      passive: true,
      capture: true,
    });
    window.addEventListener('resize', measure);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      window.removeEventListener('scroll', measure, { capture: true });
      window.removeEventListener('resize', measure);
    };
  }, [step]);

  const measured = layout.step === step;
  const rect = measured ? layout.rect : null;
  const missing = measured && Boolean(step.target) && !rect;
  const placement = measured ? layout.placement : { mode: 'center' as const };

  const nextArea = last ? runningTour?.nextArea : undefined;
  const canContinue =
    nextArea?.kind === 'pagina-atual'
      ? pageTour !== null && pageTour.id !== running.tourId
      : nextArea?.kind === 'sala-de-lote' && layout.hasLotToOpen;

  const cardStyle = placement.mode === 'below' || placement.mode === 'above' ? { top: placement.top, left: placement.left } : undefined;

  return (
    <>
      {rect && (
        <div
          className="tour-spotlight"
          aria-hidden="true"
          style={{
            top: rect.top - SPOT_PADDING,
            left: rect.left - SPOT_PADDING,
            width: rect.width + SPOT_PADDING * 2,
            height: rect.height + SPOT_PADDING * 2,
          }}
        />
      )}
      <div
        ref={cardRef}
        className={`tour-card tour-card-${placement.mode}`}
        style={cardStyle}
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
      >
        <div className="tour-card-top">
          <p className="tour-progress">{progressLabel(running)}</p>
          <button type="button" className="tour-close" onClick={() => close('dismissed')} aria-label="Fechar o tour (Esc)">
            ×
          </button>
        </div>
        <h2 id={titleId} className="tour-title">
          {step.title}
        </h2>
        <div id={bodyId}>
          <p className="tour-body">{step.body}</p>
          {missing && <p className="tour-missing">{step.missingText ?? MISSING_DEFAULT}</p>}
        </div>
        {nextArea && canContinue && (
          <button type="button" className="button button-secondary button-small tour-continue" onClick={continueToNextArea}>
            {nextArea.label}
          </button>
        )}
        <div className="tour-actions">
          {!last && (
            <button type="button" className="link-button small" onClick={() => close('dismissed')}>
              Pular tour
            </button>
          )}
          <span className="tour-actions-main">
            {/* aria-disabled em vez de disabled: o botão continua focável e o foco não se perde
                ao voltar para a primeira etapa (Anterior ali simplesmente não faz nada). */}
            <button
              type="button"
              className="button button-secondary button-small tour-prev"
              onClick={prev}
              aria-disabled={running.index === 0}
            >
              Anterior
            </button>
            <button type="button" className="button button-primary button-small" onClick={last ? () => close('completed') : next}>
              {last ? 'Concluir' : 'Próximo'}
            </button>
          </span>
        </div>
      </div>
    </>
  );
}
