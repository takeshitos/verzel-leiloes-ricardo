import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { PAGE_LABEL } from './content';
import { useTour } from './context';

/**
 * Botão "Como usar" no cabeçalho: abre o tour geral ou o desta página a qualquer momento.
 * É um painel simples (não um menu ARIA): Tab percorre as opções e Esc fecha.
 */
export function HelpMenu() {
  const { generalTour, pageTour, page, prefs, profile, start, resetTours } = useTour();
  const [open, setOpen] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  // No celular o painel é fixo na largura da tela, logo abaixo do botão (o CSS usa esta medida).
  const [panelTop, setPanelTop] = useState(0);
  const wrapper = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const done = (id: string | undefined) => (id && prefs[profile].completed.includes(id) ? ' ✓' : '');

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault(); // não fecha também um tour em andamento
      setOpen(false);
      toggle.current?.focus();
    }
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey, true); // captura: roda antes do Esc do tour
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  function launch(id: string) {
    start(id); // guarda o foco atual (dentro do menu) para voltar ao botão "Como usar"
    setOpen(false);
  }

  return (
    <div className="help-menu" ref={wrapper} data-tour="help">
      <button
        ref={toggle}
        type="button"
        className="theme-toggle help-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setPanelTop(Math.round((toggle.current?.getBoundingClientRect().bottom ?? 54) + 6));
          setOpen((value) => !value);
          setResetDone(false);
        }}
      >
        ? Como usar
      </button>
      {open && (
        <div
          id={panelId}
          className="help-menu-panel"
          role="group"
          aria-label="Tours guiados"
          style={{ '--help-top': `${panelTop}px` } as CSSProperties}
        >
          {generalTour && (
            <button type="button" className="help-menu-item" onClick={() => launch(generalTour.id)}>
              Tour geral{done(generalTour.id)}
            </button>
          )}
          {pageTour ? (
            <button type="button" className="help-menu-item" onClick={() => launch(pageTour.id)}>
              Tour desta página ({PAGE_LABEL[page!]}){done(pageTour.id)}
            </button>
          ) : (
            <p className="help-menu-note">Esta página não tem tour próprio.</p>
          )}
          <button
            type="button"
            className="help-menu-item"
            onClick={() => {
              resetTours();
              setResetDone(true);
            }}
          >
            Reiniciar tours (limpa os concluídos)
          </button>
          {resetDone && (
            <p className="help-menu-note" role="status">
              Tours reiniciados neste navegador.
            </p>
          )}
          <p className="help-menu-note">O tour só explica: não dá lances, não deposita e não altera dados.</p>
        </div>
      )}
    </div>
  );
}
