// Acesso ao DOM do tour: achar o elemento de uma etapa pelo atributo data-tour.

/** Primeiro elemento visível com data-tour="nome" (ignora os escondidos, ex.: dentro de [hidden]). */
export function findTarget(name: string): HTMLElement | null {
  const candidates = document.querySelectorAll<HTMLElement>(`[data-tour="${CSS.escape(name)}"]`);
  for (const element of candidates) {
    if (element.getClientRects().length > 0) return element;
  }
  return null;
}

/** Endereço da sala do primeiro lote mostrado na vitrine (ordem da tela: ao vivo, agendados, encerrados). */
export function firstLotRoomPath(): string | null {
  const link = findTarget('lot-card')?.querySelector<HTMLAnchorElement>('a[href^="/lotes/"]');
  return link?.getAttribute('href') ?? null;
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
