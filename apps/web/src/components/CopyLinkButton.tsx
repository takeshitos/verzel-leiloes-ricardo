import { useState } from 'react';

/** Copia um link público (ex.: comprovante) para compartilhar. Mostra o link se a cópia falhar. */
export function CopyLinkButton({ path, label = 'Copiar link' }: { path: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const url = `${window.location.origin}${path}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setState('copied');
      window.setTimeout(() => setState('idle'), 3_000);
    } catch {
      setState('failed'); // ex.: navegador sem permissão de área de transferência
    }
  }

  return (
    <span className="copy-link">
      <button type="button" className="link-button small" onClick={copy}>
        {label}
      </button>
      <span role="status" className="small muted">
        {state === 'copied' && ' Link copiado.'}
        {state === 'failed' && (
          <>
            {' '}
            Copie manualmente: <code>{url}</code>
          </>
        )}
      </span>
    </span>
  );
}
