import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { TOURS } from './content';
import { TourContext, type TourContextValue } from './context';
import { firstLotRoomPath, findTarget } from './dom';
import {
  generalTourFor,
  markFinished,
  markInvited,
  moveTour,
  pageForPath,
  pageTourFor,
  profileOf,
  progressLabel,
  resetProfile,
  resolveSteps,
  shouldInvite,
  type RunningTour,
  type TourDefinition,
  type TourPage,
  type TourPrefs,
  type TourProfile,
} from './logic';
import { readPrefs, updateStoredPrefs } from './storage';

/** Quanto o tour espera a página carregar (o elemento `readyTarget`) antes de começar mesmo assim. */
const READY_TIMEOUT_MS = 4000;

const tourById = (id: string | undefined) => TOURS.find((tour) => tour.id === id) ?? null;

/**
 * Estado do tour guiado. Regras principais:
 * - o tour só destaca e explica: nunca clica, envia formulário ou altera dados;
 * - trocar de sessão (entrar, sair, outra conta) encerra o tour em andamento;
 * - mudar de página encerra o tour daquela página (o tour geral, que usa só o cabeçalho, continua);
 * - navegar só acontece por clique da pessoa em "continuar" (vitrine → sala de um lote).
 */
export function TourProvider({ children }: { children: ReactNode }) {
  const { state, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const authReady = state.status !== 'loading';
  const profile = profileOf(user?.role);
  // Identifica a sessão só em memória (não é guardado): muda ao entrar, sair ou trocar de conta.
  const sessionKey = user ? `${user.role}:${user.publicAlias}` : state.status;
  const page = pageForPath(location.pathname);

  const [prefs, setPrefs] = useState<TourPrefs>(readPrefs);
  const [running, setRunning] = useState<RunningTour | null>(null);
  const [starting, setStarting] = useState<{
    tour: TourDefinition;
    profile: TourProfile;
  } | null>(null);
  const [pendingPage, setPendingPage] = useState<TourPage | null>(null);
  const [message, setMessage] = useState('');
  const returnFocus = useRef<HTMLElement | null>(null);

  // Sessão ou rota mudou: ajusta o estado durante a renderização (padrão do React para
  // "estado que depende de uma mudança"), sem efeito e sem um quadro com o tour errado na tela.
  const [seen, setSeen] = useState({ sessionKey, pathname: location.pathname });
  if (seen.sessionKey !== sessionKey || seen.pathname !== location.pathname) {
    const sessionChanged = seen.sessionKey !== sessionKey;
    setSeen({ sessionKey, pathname: location.pathname });
    if (sessionChanged) {
      // Entrou, saiu ou trocou de conta: nenhum tour (talvez privado) continua.
      setRunning(null);
      setStarting(null);
      setPendingPage(null);
    } else {
      if (running && tourById(running.tourId)?.page) setRunning(null);
      if (starting?.tour.page) setStarting(null);
      if (pendingPage) {
        const tour = pendingPage === page ? pageTourFor(TOURS, page, profile) : null;
        if (tour) setStarting({ tour, profile });
        setPendingPage(null);
      }
    }
  }

  // Funções simples (sem useCallback/useMemo): o estado é pequeno e o lint de hooks recusa memorização manual incompleta.
  function changePrefs(change: (current: TourPrefs) => TourPrefs) {
    setPrefs(change);
    updateStoredPrefs(change);
  }

  // Começar: espera o elemento que indica "página carregada" e só então escolhe as etapas que
  // valem (opcionais sem elemento saem, ex.: formulário de lance num lote encerrado).
  useEffect(() => {
    if (!starting) return;
    const { tour, profile: tourProfile } = starting;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const ready = !tour.readyTarget || findTarget(tour.readyTarget) !== null;
      if (!ready && Date.now() - startedAt < READY_TIMEOUT_MS) return;
      window.clearInterval(timer);
      const steps = resolveSteps(tour, tourProfile, (target) => findTarget(target) !== null);
      setStarting(null);
      setRunning({ tourId: tour.id, profile: tourProfile, steps, index: 0 });
    }, 100);
    return () => window.clearInterval(timer);
  }, [starting]);

  const generalTour = generalTourFor(TOURS, profile);
  const pageTour = pageTourFor(TOURS, page, profile);
  const runningTour = tourById(running?.tourId);
  const showInvite = authReady && shouldInvite(prefs, profile) && !running && !starting;

  // Convite mostrado = guardado como visto: não reaparece a cada atualização da página.
  // (Só o armazenamento muda aqui; na tela ele fica até a pessoa responder.)
  useEffect(() => {
    if (showInvite) updateStoredPrefs((current) => markInvited(current, profile));
  }, [showInvite, profile]);

  function start(tourId: string) {
    const tour = tourById(tourId);
    if (!tour) return;
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Aberto pelo menu "Como usar": ao fechar, o foco volta para o botão do menu.
    const help = active?.closest('[data-tour="help"]');
    returnFocus.current = help ? help.querySelector<HTMLElement>('button') : active;
    changePrefs((current) => markInvited(current, profile));
    setMessage('');
    setRunning(null);
    setStarting({ tour, profile });
  }

  function restoreFocus() {
    window.setTimeout(() => {
      const target = returnFocus.current;
      if (target && target.isConnected) target.focus();
      else document.getElementById('conteudo')?.focus();
    }, 0);
  }

  function close(how: 'completed' | 'dismissed') {
    if (!running) return;
    changePrefs((current) => markFinished(current, running.profile, running.tourId, how));
    setRunning(null);
    setMessage(how === 'completed' ? 'Tour concluído.' : 'Tour fechado. Você pode reabri-lo em "Como usar".');
    restoreFocus();
  }

  function continueToNextArea() {
    const nextArea = runningTour?.nextArea;
    if (!running || !nextArea) return;
    if (nextArea.kind === 'pagina-atual') {
      if (!pageTour) return;
      changePrefs((current) => markFinished(current, running.profile, running.tourId, 'completed'));
      setRunning(null);
      setStarting({ tour: pageTour, profile });
      return;
    }
    // 'sala-de-lote': primeiro lote mostrado na vitrine. A vitrine não tem dados a perder
    // (o filtro fica no endereço), então navegar aqui é seguro.
    const path = firstLotRoomPath();
    if (!path) return;
    changePrefs((current) => markFinished(current, running.profile, running.tourId, 'completed'));
    setRunning(null);
    setPendingPage('sala');
    navigate(path);
  }

  const value: TourContextValue = {
    profile,
    page,
    prefs,
    running,
    runningTour,
    generalTour,
    pageTour,
    showInvite,
    start,
    next: () => setRunning((current) => current && moveTour(current, { type: 'next' })),
    prev: () => setRunning((current) => current && moveTour(current, { type: 'prev' })),
    close,
    continueToNextArea,
    acceptInvite: () => {
      if (generalTour) start(generalTour.id);
    },
    declineInvite: () => {
      changePrefs((current) => markInvited(current, profile));
      setMessage('Tudo bem. O tour fica disponível em "Como usar", no topo da página.');
    },
    resetTours: () => changePrefs((current) => resetProfile(current, profile)),
  };

  const currentStep = running?.steps[running.index];
  const liveText = running && currentStep ? `${progressLabel(running)}: ${currentStep.title}` : starting ? 'Preparando o tour...' : message;

  return (
    <TourContext.Provider value={value}>
      {children}
      {/* Anúncios para leitores de tela: etapa atual, preparação e fechamento. */}
      <p className="sr-only" aria-live="polite">
        {liveText}
      </p>
    </TourContext.Provider>
  );
}
