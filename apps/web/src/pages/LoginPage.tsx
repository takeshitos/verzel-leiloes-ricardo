import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { ApiError } from '../api/client';
import { useAuth, type Role } from '../auth/useAuth';
import { Field, Notice, PageHeader } from '../components/ui';

type Mode = 'login' | 'register';

/** Só aceita caminhos internos em ?next= (evita redirecionar para outro site). */
function safeNext(value: string | null): string | null {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : null;
}

const HOME_BY_ROLE: Record<Role, string> = { seller: '/painel', bidder: '/carteira' };

export function LoginPage() {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [mode, setMode] = useState<Mode>(params.get('modo') === 'cadastro' ? 'register' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('bidder');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  if (user) return <Navigate to={next ?? HOME_BY_ROLE[user.role]} replace />;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      if (mode === 'login') await login(email, password);
      else await register(email, password, role);
      // O redirecionamento usa o papel devolvido pelo servidor (o <Navigate> acima).
      if (next) navigate(next, { replace: true });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : new ApiError(0, 'UNKNOWN', 'Erro inesperado. Tente de novo.'));
    } finally {
      setSubmitting(false);
    }
  }

  const fields = error?.details.fields ?? {};

  return (
    <div className="auth-page">
      <PageHeader eyebrow="Acesso" title={mode === 'login' ? 'Entrar' : 'Criar conta'}>
        <p>Use uma conta de licitante para dar lances ou de leiloeiro para criar lotes. Todo saldo é simulado.</p>
      </PageHeader>

      <div className="tabs" role="tablist" aria-label="Entrar ou criar conta">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'login'}
          className={mode === 'login' ? 'tab is-active' : 'tab'}
          onClick={() => {
            setMode('login');
            setError(null);
          }}
        >
          Entrar
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'register'}
          className={mode === 'register' ? 'tab is-active' : 'tab'}
          onClick={() => {
            setMode('register');
            setError(null);
          }}
        >
          Criar conta
        </button>
      </div>

      <form className="card form" onSubmit={handleSubmit} noValidate>
        {/* Mensagem da API (ex.: credenciais inválidas, muitas tentativas); erros por campo ficam abaixo de cada campo. */}
        {error && <Notice tone="error">{error.message}</Notice>}

        <Field
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={fields.email}
        />
        <Field
          id="password"
          label="Senha"
          type="password"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          required
          minLength={mode === 'register' ? 8 : undefined}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={fields.password}
          hint={mode === 'register' ? 'Pelo menos 8 caracteres.' : undefined}
        />

        {mode === 'register' && (
          <fieldset className="role-choice">
            <legend>Como você vai usar a casa de leilões?</legend>
            <label className={role === 'bidder' ? 'choice is-selected' : 'choice'}>
              <input type="radio" name="role" value="bidder" checked={role === 'bidder'} onChange={() => setRole('bidder')} />
              <span>
                <strong>Licitante</strong>
                <span className="muted small">Deposita saldo simulado e dá lances.</span>
              </span>
            </label>
            <label className={role === 'seller' ? 'choice is-selected' : 'choice'}>
              <input type="radio" name="role" value="seller" checked={role === 'seller'} onChange={() => setRole('seller')} />
              <span>
                <strong>Leiloeiro</strong>
                <span className="muted small">Cria lotes com obras do acervo. Não dá lances.</span>
              </span>
            </label>
            {fields.role && <p className="field-error">{fields.role}</p>}
            <p className="field-hint">O papel não pode ser trocado depois.</p>
          </fieldset>
        )}

        <button type="submit" className="button button-primary" disabled={submitting}>
          {submitting ? 'Enviando...' : mode === 'login' ? 'Entrar' : 'Criar conta'}
        </button>
      </form>

      <p className="muted small">
        Só quer olhar? <Link to="/">Veja a vitrine</Link> sem entrar.
      </p>
    </div>
  );
}
