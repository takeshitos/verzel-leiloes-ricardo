import { createContext, useContext } from 'react';

export type Role = 'seller' | 'bidder';

/** O que a API devolve sobre o próprio usuário. Sem id interno, senha ou token. */
export type SessionUser = { email: string; role: Role; publicAlias: string };

export type AuthState = { status: 'loading' } | { status: 'anonymous' } | { status: 'authenticated'; user: SessionUser };

export type AuthContextValue = {
  state: AuthState;
  /** Atalho: o usuário logado ou null. */
  user: SessionUser | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, role: Role) => Promise<void>;
  logout: () => Promise<void>;
  /** Relê a sessão no servidor (ex.: depois de um 401 inesperado). */
  refresh: () => void;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth precisa estar dentro de <AuthProvider>.');
  return value;
}

export const ROLE_LABEL: Record<Role, string> = { seller: 'Leiloeiro', bidder: 'Licitante' };
