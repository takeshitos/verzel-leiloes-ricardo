// Lógica pura do tour guiado: sem React e sem DOM, para ser testada isoladamente.
// Os textos ficam em content.ts; aqui só regras de seleção, navegação e preferência.

/** Perfil de quem usa o site agora. O tour e a preferência são separados por perfil. */
export type TourProfile = 'visitante' | 'licitante' | 'leiloeiro';

/** Páginas que têm tour próprio (identificadas pela rota). */
export type TourPage = 'vitrine' | 'sala' | 'auditoria' | 'comprovante' | 'carteira' | 'participacoes' | 'painel' | 'entrar';

export type TourStep = {
  /** Valor do atributo data-tour do elemento destacado. Sem alvo = cartão centralizado. */
  target?: string;
  title: string;
  body: string;
  /** Perfis que veem esta etapa (padrão: todos os perfis do tour). */
  profiles?: TourProfile[];
  /** Etapa opcional: some se o elemento não existir quando o tour começa (ex.: lista vazia). */
  optional?: boolean;
  /** Texto usado se o elemento sumir durante o tour (ex.: o lote encerrou). */
  missingText?: string;
};

/**
 * Ação oferecida na última etapa, só por clique da pessoa:
 * - 'pagina-atual': emenda o tour da página aberta (não navega);
 * - 'sala-de-lote': abre a sala do primeiro lote mostrado na vitrine e segue com o tour da sala.
 * Páginas com formulário (lance, depósito, criação de lote) não oferecem navegação.
 */
export type TourNextArea = {
  label: string;
  kind: 'pagina-atual' | 'sala-de-lote';
};

export type TourDefinition = {
  id: string;
  /** Página do tour; ausente no tour geral (que usa só o cabeçalho). */
  page?: TourPage;
  profiles: TourProfile[];
  /** Elemento que indica que a página terminou de carregar (o tour espera por ele). */
  readyTarget?: string;
  steps: TourStep[];
  nextArea?: TourNextArea;
};

export function profileOf(role: 'seller' | 'bidder' | null | undefined): TourProfile {
  if (role === 'seller') return 'leiloeiro';
  if (role === 'bidder') return 'licitante';
  return 'visitante';
}

/** Rota atual → página com tour (ou null). */
export function pageForPath(pathname: string): TourPage | null {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/') return 'vitrine';
  if (path === '/entrar') return 'entrar';
  if (path === '/carteira') return 'carteira';
  if (path === '/participacoes') return 'participacoes';
  if (path === '/painel') return 'painel';
  if (/^\/lotes\/[^/]+\/auditoria$/.test(path)) return 'auditoria';
  if (/^\/lotes\/[^/]+$/.test(path)) return 'sala';
  if (/^\/comprovantes\/[^/]+$/.test(path)) return 'comprovante';
  return null;
}

/** Tour da página atual para este perfil (as páginas restritas só têm tour para quem pode usá-las). */
export function pageTourFor(tours: TourDefinition[], page: TourPage | null, profile: TourProfile): TourDefinition | null {
  if (!page) return null;
  return tours.find((tour) => tour.page === page && tour.profiles.includes(profile)) ?? null;
}

export function generalTourFor(tours: TourDefinition[], profile: TourProfile): TourDefinition | null {
  return tours.find((tour) => !tour.page && tour.profiles.includes(profile)) ?? null;
}

/**
 * Etapas que valem agora: do perfil certo e, se opcionais, só com o elemento presente.
 * `exists` é injetado (no navegador, procura [data-tour] no documento).
 */
export function resolveSteps(tour: TourDefinition, profile: TourProfile, exists: (target: string) => boolean): TourStep[] {
  return tour.steps.filter((step) => {
    if (step.profiles && !step.profiles.includes(profile)) return false;
    if (step.optional && step.target && !exists(step.target)) return false;
    return true;
  });
}

// ---------- estado de um tour em andamento ----------

export type RunningTour = {
  tourId: string;
  profile: TourProfile;
  steps: TourStep[];
  index: number;
};

export type TourAction = { type: 'next' } | { type: 'prev' } | { type: 'goto'; index: number };

/** Próximo estado. Nunca sai dos limites; "next" na última etapa não faz nada (quem conclui é o botão Concluir). */
export function moveTour(state: RunningTour, action: TourAction): RunningTour {
  const last = state.steps.length - 1;
  const clamp = (value: number) => Math.max(0, Math.min(last, value));
  switch (action.type) {
    case 'next':
      return { ...state, index: clamp(state.index + 1) };
    case 'prev':
      return { ...state, index: clamp(state.index - 1) };
    case 'goto':
      return { ...state, index: clamp(action.index) };
  }
}

export function progressLabel(state: RunningTour): string {
  return `Etapa ${state.index + 1} de ${state.steps.length}`;
}

export const isLastStep = (state: RunningTour) => state.index >= state.steps.length - 1;

// ---------- preferência guardada no navegador ----------

/** Versão dos textos/percursos. Mudou bastante? Aumente: o convite volta a aparecer. */
export const TOUR_VERSION = 1;
export const STORAGE_KEY = `leiloes.tour.v${TOUR_VERSION}`;

export type ProfilePrefs = {
  /** Convite de primeiro acesso: já mostrado (não reabre a cada atualização da página). */
  invited: boolean;
  /** Tours concluídos (por id). */
  completed: string[];
  /** Tours fechados antes do fim (por id). */
  dismissed: string[];
};

export type TourPrefs = Record<TourProfile, ProfilePrefs>;

const emptyProfile = (): ProfilePrefs => ({
  invited: false,
  completed: [],
  dismissed: [],
});

export function emptyPrefs(): TourPrefs {
  return {
    visitante: emptyProfile(),
    licitante: emptyProfile(),
    leiloeiro: emptyProfile(),
  };
}

/** Lê o JSON guardado com tolerância: qualquer coisa estranha vira preferência vazia. Sem dados pessoais. */
export function parsePrefs(raw: string | null): TourPrefs {
  const prefs = emptyPrefs();
  if (!raw) return prefs;
  try {
    const data = JSON.parse(raw) as Partial<Record<TourProfile, Partial<ProfilePrefs>>>;
    for (const profile of Object.keys(prefs) as TourProfile[]) {
      const value = data?.[profile];
      if (!value || typeof value !== 'object') continue;
      prefs[profile] = {
        invited: value.invited === true,
        completed: Array.isArray(value.completed) ? value.completed.filter((id): id is string => typeof id === 'string') : [],
        dismissed: Array.isArray(value.dismissed) ? value.dismissed.filter((id): id is string => typeof id === 'string') : [],
      };
    }
  } catch {
    // JSON inválido: começa do zero
  }
  return prefs;
}

export function markInvited(prefs: TourPrefs, profile: TourProfile): TourPrefs {
  return { ...prefs, [profile]: { ...prefs[profile], invited: true } };
}

export function markFinished(prefs: TourPrefs, profile: TourProfile, tourId: string, how: 'completed' | 'dismissed'): TourPrefs {
  const current = prefs[profile];
  const add = (list: string[]) => (list.includes(tourId) ? list : [...list, tourId]);
  return {
    ...prefs,
    [profile]: {
      ...current,
      completed: how === 'completed' ? add(current.completed) : current.completed,
      dismissed: how === 'dismissed' ? add(current.dismissed) : current.dismissed,
    },
  };
}

/** "Reiniciar tours" no menu de ajuda: limpa só o perfil atual (o convite não volta). */
export function resetProfile(prefs: TourPrefs, profile: TourProfile): TourPrefs {
  return { ...prefs, [profile]: { ...emptyProfile(), invited: true } };
}

export const shouldInvite = (prefs: TourPrefs, profile: TourProfile) => !prefs[profile].invited;

// ---------- posição do cartão ----------

export type Rect = { top: number; left: number; width: number; height: number };
export type CardPlacement = {
  mode: 'below' | 'above' | 'sheet' | 'center';
  top?: number;
  left?: number;
};

/**
 * Onde colocar o cartão para não cobrir o alvo: abaixo, acima ou, sem espaço/celular, como uma
 * folha fixa no rodapé. Sem alvo, no centro.
 */
export function placeCard(
  target: Rect | null,
  viewport: { width: number; height: number },
  card: { width: number; height: number },
): CardPlacement {
  if (!target) return { mode: 'center' };
  if (viewport.width < 640) return { mode: 'sheet' };
  const gap = 12;
  const left = Math.max(16, Math.min(target.left, viewport.width - card.width - 16));
  const below = target.top + target.height + gap;
  if (below + card.height <= viewport.height - 8) return { mode: 'below', top: below, left };
  const above = target.top - gap - card.height;
  if (above >= 8) return { mode: 'above', top: above, left };
  return { mode: 'sheet' };
}
