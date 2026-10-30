import { describe, expect, it } from 'vitest';
import {
  emptyPrefs,
  generalTourFor,
  isLastStep,
  markFinished,
  markInvited,
  moveTour,
  pageForPath,
  pageTourFor,
  parsePrefs,
  placeCard,
  profileOf,
  progressLabel,
  resetProfile,
  resolveSteps,
  shouldInvite,
  type RunningTour,
  type TourDefinition,
} from './logic';
import { TOURS } from './content';

const fakeTour: TourDefinition = {
  id: 'teste',
  page: 'sala',
  profiles: ['visitante', 'licitante', 'leiloeiro'],
  steps: [
    { target: 'a', title: 'A', body: '.' },
    { target: 'b', title: 'B', body: '.', profiles: ['licitante'] },
    { target: 'c', title: 'C', body: '.', optional: true },
    { title: 'Sem alvo', body: '.' },
  ],
};

describe('perfil e página', () => {
  it('perfil vem do papel da sessão', () => {
    expect(profileOf(null)).toBe('visitante');
    expect(profileOf('bidder')).toBe('licitante');
    expect(profileOf('seller')).toBe('leiloeiro');
  });

  it('rota → página com tour', () => {
    expect(pageForPath('/')).toBe('vitrine');
    expect(pageForPath('/lotes/abc')).toBe('sala');
    expect(pageForPath('/lotes/abc/auditoria')).toBe('auditoria');
    expect(pageForPath('/comprovantes/xyz')).toBe('comprovante');
    expect(pageForPath('/carteira/')).toBe('carteira');
    expect(pageForPath('/sobre')).toBeNull();
  });
});

describe('percursos certos para cada perfil (conteúdo real)', () => {
  it('cada perfil tem um tour geral curto (até 7 etapas)', () => {
    for (const profile of ['visitante', 'licitante', 'leiloeiro'] as const) {
      const tour = generalTourFor(TOURS, profile);
      expect(tour).not.toBeNull();
      expect(tour!.steps.length).toBeLessThanOrEqual(7);
    }
  });

  it('páginas restritas só têm tour para quem pode usá-las', () => {
    expect(pageTourFor(TOURS, 'carteira', 'licitante')).not.toBeNull();
    expect(pageTourFor(TOURS, 'carteira', 'visitante')).toBeNull();
    expect(pageTourFor(TOURS, 'carteira', 'leiloeiro')).toBeNull();
    expect(pageTourFor(TOURS, 'painel', 'leiloeiro')).not.toBeNull();
    expect(pageTourFor(TOURS, 'painel', 'licitante')).toBeNull();
    expect(pageTourFor(TOURS, 'participacoes', 'licitante')).not.toBeNull();
    for (const page of ['vitrine', 'sala', 'auditoria', 'comprovante'] as const) {
      for (const profile of ['visitante', 'licitante', 'leiloeiro'] as const) expect(pageTourFor(TOURS, page, profile)).not.toBeNull();
    }
  });

  it('na sala, só o licitante vê a etapa do formulário de lance; só o visitante, a de entrar', () => {
    const sala = pageTourFor(TOURS, 'sala', 'visitante')!;
    const all = () => true;
    const targets = (profile: 'visitante' | 'licitante' | 'leiloeiro') => resolveSteps(sala, profile, all).map((step) => step.target);
    expect(targets('licitante')).toContain('bid-form');
    expect(targets('visitante')).not.toContain('bid-form');
    expect(targets('leiloeiro')).not.toContain('bid-form');
    expect(targets('visitante')).toContain('login-to-bid');
    expect(targets('licitante')).not.toContain('login-to-bid');
  });

  it('nenhum tour tem mais de 12 etapas numa sessão', () => {
    for (const tour of TOURS) expect(tour.steps.length).toBeLessThanOrEqual(12);
  });

  it('ids de tour são únicos', () => {
    const ids = TOURS.map((tour) => tour.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('etapas que valem agora', () => {
  it('filtra por perfil e remove opcionais sem elemento (ex.: lista vazia)', () => {
    const present = new Set(['a', 'b']);
    const steps = resolveSteps(fakeTour, 'visitante', (target) => present.has(target));
    expect(steps.map((step) => step.title)).toEqual(['A', 'Sem alvo']);
  });

  it('etapa obrigatória sem elemento continua (o cartão explica sem destacar)', () => {
    const steps = resolveSteps(fakeTour, 'licitante', () => false);
    expect(steps.map((step) => step.title)).toEqual(['A', 'B', 'Sem alvo']);
  });
});

describe('navegação entre etapas', () => {
  const state: RunningTour = {
    tourId: 't',
    profile: 'visitante',
    steps: fakeTour.steps,
    index: 0,
  };

  it('avança, volta e nunca sai dos limites', () => {
    let current = moveTour(state, { type: 'prev' });
    expect(current.index).toBe(0);
    current = moveTour(current, { type: 'next' });
    expect(progressLabel(current)).toBe('Etapa 2 de 4');
    current = moveTour(moveTour(moveTour(current, { type: 'next' }), { type: 'next' }), { type: 'next' });
    expect(current.index).toBe(3);
    expect(isLastStep(current)).toBe(true);
    expect(moveTour(current, { type: 'goto', index: 99 }).index).toBe(3);
  });
});

describe('preferência guardada (por perfil e versão, sem dados pessoais)', () => {
  it('convite: uma vez por perfil; outro perfil ainda recebe', () => {
    let prefs = emptyPrefs();
    expect(shouldInvite(prefs, 'visitante')).toBe(true);
    prefs = markInvited(prefs, 'visitante');
    expect(shouldInvite(prefs, 'visitante')).toBe(false);
    expect(shouldInvite(prefs, 'licitante')).toBe(true);
  });

  it('sobrevive a recarregar (JSON) e ignora conteúdo estranho', () => {
    const prefs = markFinished(markInvited(emptyPrefs(), 'licitante'), 'licitante', 'geral-licitante', 'completed');
    const reloaded = parsePrefs(JSON.stringify(prefs));
    expect(reloaded.licitante).toEqual({
      invited: true,
      completed: ['geral-licitante'],
      dismissed: [],
    });
    expect(parsePrefs('{nada')).toEqual(emptyPrefs());
    expect(parsePrefs(JSON.stringify({ licitante: { invited: 'sim', completed: [1, 'x'] } })).licitante).toEqual({
      invited: false,
      completed: ['x'],
      dismissed: [],
    });
  });

  it('conclusão e dispensa ficam separadas e sem repetição; reiniciar limpa só o perfil', () => {
    let prefs = markFinished(emptyPrefs(), 'leiloeiro', 'painel', 'dismissed');
    prefs = markFinished(prefs, 'leiloeiro', 'painel', 'dismissed');
    prefs = markFinished(prefs, 'visitante', 'vitrine', 'completed');
    expect(prefs.leiloeiro.dismissed).toEqual(['painel']);
    prefs = resetProfile(prefs, 'leiloeiro');
    expect(prefs.leiloeiro).toEqual({
      invited: true,
      completed: [],
      dismissed: [],
    });
    expect(prefs.visitante.completed).toEqual(['vitrine']);
  });

  it('a preferência não guarda email, pseudônimo nem ids', () => {
    const text = JSON.stringify(markFinished(markInvited(emptyPrefs(), 'licitante'), 'licitante', 'carteira', 'completed'));
    expect(text).not.toMatch(/@|LIC-|VEN-|[0-9a-f]{8}-[0-9a-f]{4}/);
  });
});

describe('posição do cartão', () => {
  const viewport = { width: 1280, height: 800 };
  const card = { width: 360, height: 200 };

  it('sem alvo: centro; celular: folha no rodapé', () => {
    expect(placeCard(null, viewport, card).mode).toBe('center');
    expect(placeCard({ top: 100, left: 10, width: 100, height: 40 }, { width: 375, height: 812 }, card).mode).toBe('sheet');
  });

  it('abaixo do alvo quando cabe; acima quando não cabe embaixo; nunca fora da tela na horizontal', () => {
    expect(placeCard({ top: 100, left: 1200, width: 60, height: 40 }, viewport, card)).toMatchObject({ mode: 'below', left: 904 });
    expect(placeCard({ top: 650, left: 100, width: 200, height: 60 }, viewport, card)).toMatchObject({ mode: 'above', top: 438 });
    expect(placeCard({ top: 150, left: 100, width: 200, height: 560 }, viewport, card).mode).toBe('sheet');
  });
});
