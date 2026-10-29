import { useState } from 'react';

type Theme = 'light' | 'dark';
const STORAGE_KEY = 'tema';

/** Tema salvo pela pessoa, se houver. O navegador pode bloquear o armazenamento: aí vale o sistema. */
function savedTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

function currentTheme(): Theme {
  return savedTheme() ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}

/**
 * Alterna tema claro/escuro (extra). A escolha fica salva neste navegador; sem escolha, segue o
 * sistema. O index.html aplica o tema salvo antes da primeira pintura (sem piscar).
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(currentTheme);
  const next: Theme = theme === 'dark' ? 'light' : 'dark';

  function toggle() {
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Sem armazenamento: o tema vale só até recarregar.
    }
    setTheme(next);
  }

  return (
    <button type="button" className="theme-toggle" onClick={toggle} aria-label={`Usar tema ${next === 'dark' ? 'escuro' : 'claro'}`}>
      {theme === 'dark' ? '☀ Tema claro' : '☾ Tema escuro'}
    </button>
  );
}
