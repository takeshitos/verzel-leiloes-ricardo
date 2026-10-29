import type { InputHTMLAttributes, ReactNode } from 'react';

// Componentes pequenos de estado e formulário, usados em todas as telas.

export function Loading({ label = 'Carregando...' }: { label?: string }) {
  return (
    <div className="state state-loading" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      {label}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state state-error" role="alert">
      <p>{message}</p>
      {onRetry && (
        <button type="button" className="button button-secondary" onClick={onRetry}>
          Tentar de novo
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="state state-empty">
      <p className="state-title">{title}</p>
      {children && <div className="state-body">{children}</div>}
    </div>
  );
}

type NoticeTone = 'info' | 'success' | 'warning' | 'error';

/** Aviso em linha. `error` e `warning` são anunciados na hora por leitores de tela. */
export function Notice({ tone = 'info', title, children }: { tone?: NoticeTone; title?: string; children?: ReactNode }) {
  const urgent = tone === 'error' || tone === 'warning';
  return (
    <div className={`notice notice-${tone}`} role={urgent ? 'alert' : 'status'}>
      {title && <p className="notice-title">{title}</p>}
      {children && <div className="notice-body">{children}</div>}
    </div>
  );
}

/** Tela (ou parte dela) que pertence a uma etapa posterior: deixa claro o que falta, sem fingir. */
export function PendingFeature({ step, children }: { step: string; children: ReactNode }) {
  return (
    <Notice tone="info" title={`Em construção (${step})`}>
      {children}
    </Notice>
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <header className="page-header">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1>{title}</h1>
      {children && <div className="page-header-body">{children}</div>}
    </header>
  );
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  error?: string;
  hint?: string;
};

/** Campo com label, dica e erro ligados ao input (aria-describedby / aria-invalid). */
export function Field({ id, label, error, hint, ...input }: FieldProps) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`field${error ? ' field-invalid' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <input id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...input} />
      {hint && (
        <p id={`${id}-hint`} className="field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}
