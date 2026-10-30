import { createContext, useContext } from 'react';
import type { RunningTour, TourDefinition, TourPage, TourPrefs, TourProfile } from './logic';

export type TourContextValue = {
  profile: TourProfile;
  page: TourPage | null;
  prefs: TourPrefs;
  /** Tour em andamento (null = nenhum). */
  running: RunningTour | null;
  runningTour: TourDefinition | null;
  generalTour: TourDefinition | null;
  /** Tour da página aberta para este perfil (null = a página não tem tour). */
  pageTour: TourDefinition | null;
  showInvite: boolean;
  start: (tourId: string) => void;
  next: () => void;
  prev: () => void;
  close: (how: 'completed' | 'dismissed') => void;
  /** Ação da última etapa (continuar para outra área), só por clique da pessoa. */
  continueToNextArea: () => void;
  acceptInvite: () => void;
  declineInvite: () => void;
  resetTours: () => void;
};

export const TourContext = createContext<TourContextValue | null>(null);

export function useTour(): TourContextValue {
  const value = useContext(TourContext);
  if (!value) throw new Error('useTour precisa estar dentro de <TourProvider>');
  return value;
}
