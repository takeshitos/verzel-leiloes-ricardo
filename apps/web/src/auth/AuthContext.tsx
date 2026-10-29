import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError, apiGet, apiPost } from '../api/client';
import { getSocket, reconnectSocket } from '../realtime/socket';
import { AuthContext, type AuthContextValue, type AuthState, type Role, type SessionUser } from './useAuth';

/**
 * Sessão real: o cookie HttpOnly é do servidor; aqui só guardamos o que /api/auth/me devolveu
 * para desenhar a navegação. Quem autoriza cada ação é sempre o backend.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  const refresh = useCallback(() => {
    apiGet<{ user: SessionUser }>('/auth/me')
      .then(({ user }) => setState({ status: 'authenticated', user }))
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) setState({ status: 'anonymous' });
        else setState((current) => (current.status === 'loading' ? { status: 'anonymous' } : current));
      });
  }, []);

  useEffect(() => {
    refresh();
    // Logout em outra aba ou sessão expirada: o servidor avisa pela conexão em tempo real.
    const socket = getSocket();
    const onEnded = () => setState({ status: 'anonymous' });
    socket.on('session.ended', onEnded);
    return () => {
      socket.off('session.ended', onEnded);
    };
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const { user } = await apiPost<{ user: SessionUser }>('/auth/login', { email, password });
    setState({ status: 'authenticated', user });
    reconnectSocket(); // o servidor relê o cookie e coloca a conexão na sala privada
  }, []);

  const register = useCallback(async (email: string, password: string, role: Role) => {
    const { user } = await apiPost<{ user: SessionUser }>('/auth/register', { email, password, role });
    setState({ status: 'authenticated', user });
    reconnectSocket();
  }, []);

  const logout = useCallback(async () => {
    await apiPost<void>('/auth/logout');
    setState({ status: 'anonymous' });
    reconnectSocket();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ state, user: state.status === 'authenticated' ? state.user : null, login, register, logout, refresh }),
    [state, login, register, logout, refresh],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
