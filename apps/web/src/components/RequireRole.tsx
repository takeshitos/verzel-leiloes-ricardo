import type { ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import { ROLE_LABEL, useAuth, type Role } from '../auth/useAuth';
import { Loading, Notice, PageHeader } from './ui';

/**
 * Proteção VISUAL da tela: sem login vai para /entrar; papel errado vê um aviso.
 * A autorização de verdade é do backend (cada rota da API confere sessão e papel).
 */
export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { state } = useAuth();
  const location = useLocation();

  if (state.status === 'loading') return <Loading label="Conferindo sua sessão..." />;
  if (state.status === 'anonymous') {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/entrar?next=${next}`} replace />;
  }
  if (state.user.role !== role) {
    return (
      <>
        <PageHeader title="Área restrita" />
        <Notice tone="warning" title={`Esta área é para ${ROLE_LABEL[role].toLowerCase()}s.`}>
          Você entrou como {ROLE_LABEL[state.user.role].toLowerCase()}. <Link to="/">Voltar para a vitrine</Link>.
        </Notice>
      </>
    );
  }
  return <>{children}</>;
}
