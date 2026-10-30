import { INVITE_TEXT } from './content';
import { useTour } from './context';

/**
 * Convite discreto de primeiro acesso (um por perfil). Fica no fluxo da página, sem cobrir nada
 * e sem roubar o foco; depois de mostrado não reaparece ao recarregar.
 */
export function TourInvite() {
  const { showInvite, profile, acceptInvite, declineInvite } = useTour();
  if (!showInvite) return null;
  return (
    <aside className="tour-invite" aria-label="Convite para o tour guiado">
      <div className="tour-invite-inner">
        <p>{INVITE_TEXT[profile]}</p>
        <div className="tour-invite-actions">
          <button type="button" className="button button-primary button-small" onClick={acceptInvite}>
            Iniciar tour
          </button>
          <button type="button" className="button button-secondary button-small" onClick={declineInvite}>
            Agora não
          </button>
        </div>
      </div>
    </aside>
  );
}
