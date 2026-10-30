// Preferência do tour neste navegador (localStorage). Só perfil, ids de tour e "convite já mostrado":
// nenhum email, pseudônimo ou id de usuário. O navegador pode bloquear o armazenamento: aí o tour
// funciona do mesmo jeito, só não lembra a escolha depois de recarregar.
import { STORAGE_KEY, parsePrefs, type TourPrefs } from './logic';

export function readPrefs(): TourPrefs {
  try {
    return parsePrefs(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return parsePrefs(null);
  }
}

/** Aplica a mudança sobre o que está guardado agora (não sobrescreve com uma cópia antiga). */
export function updateStoredPrefs(change: (prefs: TourPrefs) => TourPrefs): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(change(readPrefs())));
  } catch {
    // Sem armazenamento: vale só até recarregar.
  }
}
